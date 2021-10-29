import https from 'https';
import axios from 'axios';

import logger from './logging.mjs';

const ORDS_HOST = process.env.ORDS_HOST || 'oracle-db-ords-service';
const ORDS_PORT = process.env.ORDS_PORT || '8888';
const ORDS_USER = process.env.ORDS_USER || 'ORDS_PUBLIC_USER';
const ORDS_PASSWORD = process.env.ORDS_PASSWORD || 'PDos00###';
const ORDS_PROTOCOL = process.env.ORDS_PROTOCOL || 'http';
// const ORDS_CREDENTIAL_SECRET_NAME = process.env.ORDS_CREDENTIAL_SECRET_NAME
// || 'oracle-db-ords-credentials';
// const DB_FILENAME_CONVERSION_PATTERN = process.env.DB_FILENAME_CONVERSION_PATTERN
// || '("/opt/oracle/oradata/ORCLCDB/pdbseed/","/opt/oracle/oradata/ORCLCDB/##PDBNAME##/")';

const ORDS_PATH_CREATE_PDB = '_/db-api/stable/database/pdbs/';
const ORDS_PATH_DROP_PDB = '_/db-api/stable/database/pdbs/##PDB_NAME##/?action=##ACTION##';

function getUrl(path) {
  return `${ORDS_PROTOCOL}://${ORDS_HOST}:${ORDS_PORT}/ords/${path}`;
}

export async function createPdb(data, namespace) {
  const auth = Buffer.from(`${ORDS_USER}:${ORDS_PASSWORD}`, 'utf-8').toString('base64');
  const url = getUrl(ORDS_PATH_CREATE_PDB);
  const config = {
    method: 'post',
    url,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      Authorization: `Basic ${auth}`,
    },
    httpsAgent: new https.Agent({
      rejectUnauthorized: false,
    }),
    data,
  };
  logger.info(config);
  try {
    const response = await axios(config);
    logger.info(response);
  } catch (error) {
    logger.error(error);
  }
}

export async function deletePdb(name) {
  const auth = Buffer.from(`${ORDS_USER}:${ORDS_PASSWORD}`, 'utf-8').toString('base64');
  const url = getUrl(ORDS_PATH_DROP_PDB.replace('##PDB_NAME##', name).replace('##ACTION##', 'INCLUDING'));
  const config = {
    method: 'delete',
    url,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      Authorization: `Basic ${auth}`,
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
