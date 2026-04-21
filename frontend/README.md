# DeFi Bank Frontend

Simple React + Vite frontend to interact with the `DecentralizedBank` contract.

How to run:

1. Copy the contract ABI to `frontend/DecentralizedBank.abi.json`. You can get ABI from `build/contracts/DecentralizedBank.json` (use the `abi` field).
2. Install dependencies:

```bash
cd frontend
npm install
npm run dev
```

3. Open http://localhost:5173, connect MetaMask, paste the deployed contract address (from migrations) and use the buttons.
