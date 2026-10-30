// A small pool of worker threads that read documents in the background.
const { Worker } = require('worker_threads');
const path = require('path');

const WORKER_FILE = path.join(__dirname, 'extractWorker.js');
const TIMEOUT_MS = 90 * 1000; // give up on a single file after 90 seconds

function createPool(size) {
  const slots = [];
  const queue = [];

  function startSlot() {
    const slot = { worker: new Worker(WORKER_FILE), job: null, timer: null };
    slot.worker.on('message', (msg) => {
      clearTimeout(slot.timer);
      const job = slot.job;
      slot.job = null;
      if (job) job.resolve((msg && msg.text) || '');
      pump();
    });
    slot.worker.on('error', () => fail(slot));
    slot.worker.on('exit', () => fail(slot));
    return slot;
  }

  // The worker crashed or got stuck: replace it and skip that file.
  function fail(slot) {
    clearTimeout(slot.timer);
    const job = slot.job;
    slot.job = null;
    slot.worker.removeAllListeners();
    slot.worker.terminate().catch(() => {});
    const i = slots.indexOf(slot);
    if (i >= 0) slots[i] = startSlot();
    if (job) job.resolve('');
    pump();
  }

  function pump() {
    for (const slot of slots) {
      if (slot.job || !queue.length) continue;
      const job = queue.shift();
      slot.job = job;
      slot.timer = setTimeout(() => fail(slot), TIMEOUT_MS);
      slot.worker.postMessage(job.data);
    }
  }

  for (let i = 0; i < size; i++) slots.push(startSlot());

  return {
    extract(file, ext, fileSize) {
      return new Promise((resolve) => {
        queue.push({ data: { path: file, ext, size: fileSize }, resolve });
        pump();
      });
    },
    close() {
      queue.length = 0;
      for (const slot of slots) {
        slot.worker.removeAllListeners();
        slot.worker.terminate().catch(() => {});
      }
    }
  };
}

module.exports = { createPool };