const jobs = new Map();

export function publishOnce(key, task) {
  const current = jobs.get(key);
  if (current) return current;
  const job = Promise.resolve().then(task).finally(() => {
    if (jobs.get(key) === job) jobs.delete(key);
  });
  jobs.set(key, job);
  return job;
}
