import React, { useEffect, useState } from 'react'
import Web3 from 'web3'

export default function App() {
  const [web3, setWeb3] = useState(null)
  const [account, setAccount] = useState(null)
  const [contractAddress, setContractAddress] = useState('')
  const [abi, setAbi] = useState(null)
  const [dbank, setDbank] = useState(null)
  const [balance, setBalance] = useState('0')

  useEffect(() => {
    if (window.ethereum) {
      const w3 = new Web3(window.ethereum)
      setWeb3(w3)
    }
  }, [])

  async function connect() {
    if (!web3) return alert('Install MetaMask')
    const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' })
    setAccount(accounts[0])
  }

  async function loadContract() {
    if (!web3) return alert('No web3')
    if (!contractAddress) return alert('Enter contract address')
    // load ABI from build artifact via fetch (user must serve file or paste ABI)
    try {
      const res = await fetch('/DecentralizedBank.abi.json')
      const artifact = await res.json()
      const c = new web3.eth.Contract(artifact.abi, contractAddress)
      setDbank(c)
      setAbi(artifact.abi)
      const bal = await c.methods.etherBalanceOf(account).call()
      setBalance(web3.utils.fromWei(bal, 'ether'))
    } catch (e) {
      alert('Failed to load ABI. Place DecentralizedBank.abi.json in frontend root.')
    }
  }

  async function deposit() {
    const val = prompt('Amount in ETH to deposit', '0.01')
    if (!val) return
    await dbank.methods.deposit().send({ from: account, value: web3.utils.toWei(val, 'ether') })
    alert('Deposit transaction sent')
  }

  async function withdraw() {
    await dbank.methods.withdraw().send({ from: account })
    alert('Withdraw transaction sent')
  }

  async function borrow() {
    const val = prompt('Collateral in ETH', '0.01')
    if (!val) return
    await dbank.methods.borrow().send({ from: account, value: web3.utils.toWei(val, 'ether') })
    alert('Borrow transaction sent')
  }

  async function payOff() {
    await dbank.methods.payOff().send({ from: account })
    alert('PayOff transaction sent')
  }

  return (
    <div style={{ padding: 24, fontFamily: 'Arial, sans-serif' }}>
      <h2>DeFi Bank — Simple Frontend</h2>
      <div style={{ marginBottom: 12 }}>
        <button onClick={connect}>Connect MetaMask</button>
        <span style={{ marginLeft: 12 }}>{account}</span>
      </div>

      <div style={{ marginBottom: 12 }}>
        <input value={contractAddress} onChange={e => setContractAddress(e.target.value)} placeholder="Contract address" style={{ width: 400 }} />
        <button onClick={loadContract} style={{ marginLeft: 8 }}>Load Contract</button>
      </div>

      <div style={{ marginTop: 16 }}>
        <strong>Your deposited balance:</strong> {balance} ETH
      </div>

      <div style={{ marginTop: 12 }}>
        <button onClick={deposit}>Deposit</button>
        <button onClick={withdraw} style={{ marginLeft: 8 }}>Withdraw</button>
        <button onClick={borrow} style={{ marginLeft: 8 }}>Borrow</button>
        <button onClick={payOff} style={{ marginLeft: 8 }}>PayOff</button>
      </div>
    </div>
  )
}
