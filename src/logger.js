function stamp(level, args) {
  console[level](new Date().toISOString(), ...args);
}

export const logger = {
  info: (...args) => stamp('log', args),
  warn: (...args) => stamp('warn', args),
  error: (...args) => stamp('error', args),
};
