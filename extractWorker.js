// Runs in a separate thread so heavy PDF / Excel / Word parsing never freezes the window.
const { parentPort } = require('worker_threads');
const { extractText } = require('./extractor');

parentPort.on('message', async (job) => {
  let text = '';
  try {
    text = await extractText(job.path, job.ext, job.size);
  } catch (e) {}
  parentPort.postMessage({ text: text || '' });
});