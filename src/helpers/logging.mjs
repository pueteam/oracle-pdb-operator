import bunyan from 'bunyan';
import pretty from '@mechanicalhuman/bunyan-pretty';

const logger = bunyan.createLogger({
  name: 'myapp',
  stream: process.env.NODE_ENV === 'development' ? pretty(process.stdout, { timeStamps: false }) : '',
  level: process.env.LOG_LEVEL ? process.env.LOG_LEVEL : 'debug',
});

export default logger;

// export default logger;
