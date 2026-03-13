//require('dotenv').config()

const express = require('express');

const app = express();
app.use(express.json);

const port = 3000

app.get('/', (req, res) => {

    res.send('fintech api');
})

app.listen(port, ()=>{
    console.log(`server is listening on prot ${port}`)
})

app()
