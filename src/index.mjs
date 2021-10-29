import * as k8s from '@kubernetes/client-node';
import * as fs from 'fs';

import logger from './helpers/logging.mjs';

import { createPdb, deletePdb } from './helpers/ords.mjs';

// process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const OPDB_GROUP = 'oracle.pue.es';
const OPDB_VERSION = 'v1alpha1';
const OPDB_PLURAL = 'pdbs';
const NAMESPACE = 'oracle';

const kc = new k8s.KubeConfig();
kc.loadFromDefault();

const k8sApi = kc.makeApiClient(k8s.AppsV1Api);
const k8sApiMC = kc.makeApiClient(k8s.CustomObjectsApi);
const k8sApiPods = kc.makeApiClient(k8s.CoreV1Api);

const DB_FILENAME_CONVERSION_PATTERN = process.env.DB_FILENAME_CONVERSION_PATTERN || '("/opt/oracle/oradata/ORCLCDB/pdbseed/","/opt/oracle/oradata/ORCLCDB/##PDBNAME##/")';

// const crdFile = fs.readFileSync('../manifest/oracle.pue.es_pdbs.yaml', 'utf-8');
const watch = new k8s.Watch(kc);

let reconcileScheduled = false;

async function getPodList(podSelector) {
  try {
    const podList = await k8sApiPods.listNamespacedPod(
      NAMESPACE,
      undefined,
      undefined,
      undefined,
      undefined,
      podSelector,
    );
    return podList.body.items.map((pod) => pod.metadata.name);
  } catch (err) {
    logger.error(err);
  }
  return [];
}

async function createSecret(data, namespace) {
  const secret = {
    metadata: {
      name: data.pdb_name,
    },
    type: 'Opaque',
    stringData: { username: data.adminName, passwd: data.adminPwd, jdbcUrl: 'TBD' },
  };
  logger.info(secret);
  await k8sApiPods.createNamespacedSecret(namespace, secret).then(
    (response) => {
      logger.info('Secret created');
      logger.info(response);
    },
    (err) => {
      logger.error(err);
    },
  );
}

async function deleteSecret(name, namespace) {
  await k8sApiPods.deleteNamespacedSecret(name, namespace).then(
    (response) => {
      logger.info('Secret deleted');
      logger.info(response);
    },
    (err) => {
      logger.error(err);
    },
  );
}

function randomPassword(length) {
  let result = '';
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const charactersLength = characters.length;
  for (let i = 0; i < length; i += 1) {
    result += characters.charAt(Math.floor(Math.random() * charactersLength));
  }
  return result;
}

async function reconcileNow(e) {
  const object = e;
  const { metadata } = object;
  const { spec } = object;
  logger.info('Resource modified');
  logger.info(e);
  const method = 'CREATE';
  const fileNameConversions = DB_FILENAME_CONVERSION_PATTERN;
  const pdbName = metadata.name;
  const adminName = spec.adminName ? spec.adminName : 'DBUSER';
  const adminPwd = spec.adminPwd ? spec.adminPwd : randomPassword(15);
  const totalSize = spec.storage;
  const tempSize = spec.tempStorage;
  const reuseTempFile = true;
  const unlimitedStorage = false;
  const nameSpace = metadata.namespace;
  const data = {
    method,
    pdb_name: pdbName,
    adminName,
    adminPwd,
    fileNameConversions,
    unlimitedStorage,
    reuseTempFile,
    totalSize,
    tempSize,
  };
  if (!object.status || object.status.observedGeneration !== metadata.generation) {
    // TODO: handle resource modification here
    await createPdb(data, nameSpace);
    await createSecret(data, nameSpace);
    const status = {
      apiVersion: object.apiVersion,
      kind: object.kind,
      metadata: {
        name: object.metadata.name,
        resourceVersion: object.metadata.resourceVersion,
      },
      status: {
        observedGeneration: metadata.generation,
      },
    };
    k8sApiMC.replaceNamespacedCustomObjectStatus(
      OPDB_GROUP,
      OPDB_VERSION,
      NAMESPACE,
      OPDB_PLURAL,
      object.metadata.name,
      status,
    );
  }
}

function scheduleReconcile(obj) {
  if (!reconcileScheduled) {
    setTimeout(reconcileNow, 1000, obj);
    reconcileScheduled = true;
  }
}

async function deleteResource(obj) {
  logger.info(`Deleted ${obj.metadata.name}`);
  const { metadata } = obj;
  await deletePdb(metadata.name);
  await deleteSecret(metadata.name, metadata.namespace);
  // return k8sApi.deleteNamespacedDeployment(obj.metadata.name!, NAMESPACE);
}

async function onEvent(phase, apiObj) {
  logger.info(`Received event in phase ${phase}.`);
  if (phase === 'ADDED' || phase === 'MODIFIED') {
    scheduleReconcile(apiObj);
  } else if (phase === 'DELETED') {
    await deleteResource(apiObj);
  } else {
    logger.info(`Unknown event type: ${phase}`);
  }
}

async function watchResource() {
  logger.info('Watching API');
  return watch.watch(
    `/apis/${OPDB_GROUP}/${OPDB_VERSION}/namespaces/${NAMESPACE}/${OPDB_PLURAL}`,
    {},
    onEvent,
    onDone,
  );
}

function onDone(err) {
  logger.info(`Connection closed. ${err}`);
  watchResource();
}

async function main() {
  await watchResource();
}

main();
