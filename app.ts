require('dotenv').config()


const express = require('express');

const connectDB = require('./db/connect');
const authenticateUser = require('./middleware/authentication');

const app = express();
app.use(express.json());

const port = 3000

app.get('/', (req, res) => {

    res.send('fintech api');
})

const start = async () => {
  try {
    await connectDB(process.env.MONGO_URI);
    app.listen(port, () =>
      console.log(`Server is listening on port ${port}...`)
    );
  } catch (error) {
    console.log(error);
  }
};

start();

