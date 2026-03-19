BACKEND



Route	Method	Purpose
/users	POST	Create a user
/users/:id	GET	Get user details

/wallets	POST	Create a wallet for a user
/wallets/:id	GET	Display wallet info (balance, user, etc)
/wallets/search	GET	Search wallet by userId, email, phone
/transfer	POST	Transfer money between wallets
/ledger/:walletId	GET	View all transactions of a wallet
/audit/:walletId	GET	View audit logs for wallet



