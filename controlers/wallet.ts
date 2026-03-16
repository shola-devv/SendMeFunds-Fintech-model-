
const wallet = require("../models/wallet");

//post create wallet
const createWallet =  (req:Request, res:Response )=>{
    //check if pin from the res.pin is correct with 
    // middleware
//instantiate wallet with 1000naira

}


// /wallets/:id	GET	Display wallet info (balance, user, etc)
const getWallet =  (req:Request, res:Response )=>{


}

// /wallets/search	GET	Search wallet by userId, email, phone
const findWallet =  (req:Request, res:Response )=>{


}

// /wallets/:id	add 100 to user wallet
const fundWallet =  (req:Request, res:Response )=>{
//add 1000naira to the wallet
//authenticate if user is the one rquesting
//if timestamp of user is more than a month of auditlog  

}


// /transfer	POST	Transfer money between wallets
const transferMoney =  (req:Request, res:Response )=>{
}


// /ledger/:walletId	GET	View all transactions of a wallet
const viewLedger =  (req:Request, res:Response )=>{


}


// /audit/:walletId	GET	View audit logs for wallet
const viewAuditLogs =  (req:Request, res:Response )=>{


}

module.exports = [
  
createWallet,
getWallet,
findWallet,
transferMoney,
transferMoney,
viewLedger,
viewAuditLogs,

]