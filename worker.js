const createWorkerApp = require('./src/workerApp');

const PORT = process.env.PORT || 8080;
const app = createWorkerApp();

app.listen(PORT, () => {
  console.log(`Sync worker is running on port ${PORT}`);
});
