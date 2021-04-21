import Operator, { ResourceEventType, ResourceEvent } from '@dot-i/k8s-operator';
const https = require('https');
const bunyan = require('bunyan');
const Path = require('path');
const axios = require('axios');
const k8s = require('@kubernetes/client-node');
const logger = bunyan.createLogger({ name: 'oracle-pdb-operator' });

const CRD = process.env.CRD || 'true';
const ORDS_HOST = process.env.ORDS_HOST || 'oracle-db-ords-service';
const ORDS_PORT = process.env.ORDS_PORT || '8888';
const ORDS_USER = process.env.ORDS_USER || 'ORDS_PUBLIC_USER';
const ORDS_PASSWORD = process.env.ORDS_PASSWORD || 'PDos00###';
const ORDS_PROTOCOL = process.env.ORDS_PROTOCOL || 'http';
const ORDS_CREDENTIAL_SECRET_NAME = process.env.ORDS_CREDENTIAL_SECRET_NAME || 'oracle-db-ords-credentials';
const DB_FILENAME_CONVERSION_PATTERN = process.env.DB_FILENAME_CONVERSION_PATTERN || '("/opt/oracle/oradata/ORCLCDB/pdbseed/","/opt/oracle/oradata/ORCLCDB/##PDBNAME##/")';

const ORDS_PATH_CREATE_PDB = '_/db-api/stable/database/pdbs/';
const ORDS_PATH_DROP_PDB = '_/db-api/stable/database/pdbs/##PDB_NAME##/?action=##ACTION##';

const kc = new k8s.KubeConfig();
kc.loadFromDefault();

const k8sApi = kc.makeApiClient(k8s.CoreV1Api);

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

export default class PDBOperator extends Operator {
    protected async init() {
        const crdFile = Path.resolve(__dirname, '../manifest', 'oracle.pue.es_pdbs.yaml');
        console.log(crdFile);
        const { group, versions, plural } = await this.registerCustomResourceDefinition(crdFile);
        await this.watchResource(group, versions[0].name, plural, async (e) => {
            try {
                if (e.type === ResourceEventType.Added || e.type === ResourceEventType.Modified) {
                    if (!await this.handleResourceFinalizer(e, `${versions[0].name}.${group}`, (event) => this.resourceDeleted(event))) {
                        await this.resourceModified(e);
                    }
                }
            } catch (err) {
                logger.error(err);
            }
        });
    }
    private async resourceModified(e: any) {
        const object = e.object;
        const metadata = object.metadata;
        const spec = object.spec;
        logger.info('Resource modified');
        logger.info(e);
        const method = 'CREATE';
        const fileNameConversions = DB_FILENAME_CONVERSION_PATTERN;
        const pdb_name = metadata.name;
        const adminName = 'DBUSER';
        const adminPwd = this.randomPassword(15);
        const totalSize = spec.storage;
        const tempSize = spec.tempStorage;
        const reuseTempFile = true;
        const unlimitedStorage = false;
        const nameSpace = metadata.namespace;
        const data = { method, pdb_name, adminName, adminPwd, fileNameConversions, unlimitedStorage, reuseTempFile, totalSize, tempSize};

        if (!object.status || object.status.observedGeneration !== metadata.generation) {

            // TODO: handle resource modification here
            await this.createPdb(data, nameSpace);
            await this.setResourceStatus(e.meta, {
                observedGeneration: metadata.generation
            });
        }
    }

    private async resourceDeleted(e: ResourceEvent) {
        // TODO: handle resource deletion here
        logger.info('Resource deleted');
        logger.info(e);
        const object = e.object;
        const metadata = object.metadata;
        await this.deletePdb(metadata.name);
        await this.deleteSecret(metadata.name, metadata.namespace);
    }

    private async getUrl(path: string) {
        return `${ORDS_PROTOCOL}://${ORDS_HOST}:${ORDS_PORT}/ords/${path}`
    }

    private async createPdb(data: any, namespace: string) {
        const auth = Buffer.from(`${ORDS_USER}:${ORDS_PASSWORD}`, 'utf-8').toString('base64');
        const url = await this.getUrl(ORDS_PATH_CREATE_PDB);
        const config = {
            method: 'post',
            url: url,
            headers: { 
              'Content-Type': 'application/json; charset=utf-8', 
              'Authorization': `Basic ${auth}`,
            },
            httpsAgent: new https.Agent({  
               rejectUnauthorized: false
            }),
            data : data
        };
        logger.info(config);
        try {
            const response = await axios(config);
            logger.info(response);
            this.createSecret(data, namespace);
        } catch (error) {
            logger.error(error);
        }
    }

    private async deletePdb(name: string) {
        const auth = Buffer.from(`${ORDS_USER}:${ORDS_PASSWORD}`, 'utf-8').toString('base64');
        const url = await this.getUrl(ORDS_PATH_DROP_PDB.replace('##PDB_NAME##', name).replace('##ACTION##', 'INCLUDING'));
        const config = {
            method: 'delete',
            url: url,
            headers: { 
              'Content-Type': 'application/json; charset=utf-8', 
              'Authorization': `Basic ${auth}`,
            },
        };
        logger.info(config);
        try {
            const response = await axios(config);
            logger.info(response);
        } catch (error) {
            logger.error(error);
        }
    }

    private async createSecret(data: any, namespace: string) {
        const secret = {
            metadata: {
              name: data.pdb_name,
            },
            type: 'Opaque',
            stringData: { username: data.adminName, passwd: data.adminPwd, jdbcUrl: 'TBD'}
        };
        logger.info(secret);
        await k8sApi.createNamespacedSecret(namespace, secret).then(
            (response) => {
                logger.info('Secret created');
                logger.info(response);
            },
            (err) => {
                logger.error(err);
            }
        );
    }

    private async deleteSecret(name: string, namespace: string) {
        await k8sApi.deleteNamespacedSecret(name, namespace).then(
            (response) => {
                logger.info('Secret deleted');
                logger.info(response);
            },
            (err) => {
                logger.error(err);
            }
        );
    }

    private randomPassword(length): string {
        let result = '';
        const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        const charactersLength = characters.length;
        for (let i = 0; i < length; i += 1) {
          result += characters.charAt(Math.floor(Math.random() * charactersLength));
        }
        return result;
      }
}

async function main() : Promise<any> {
  const operator = new PDBOperator(logger);
  await operator.start();
  logger.info('started');

  const exit = (reason: string) => {
      operator.stop();
      process.exit(0);
  };

  process.on('SIGTERM', () => exit('SIGTERM'))
      .on('SIGINT', () => exit('SIGINT'));
}

main();
