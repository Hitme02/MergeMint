import { ethers } from 'ethers'
import { useUser } from '../context/UserContext'
import toast from 'react-hot-toast'

export default function WalletConnectButton() {
  const { wallet, setWallet } = useUser()
  async function connect() {
    try {
      const eth = (window as any).ethereum
      if (!eth) return toast.error('MetaMask not found')
      const provider = new ethers.BrowserProvider(eth)
      await provider.send('eth_requestAccounts', [])
      const signer = await provider.getSigner()
      const addr = await signer.getAddress()
      setWallet(addr)
      toast.success('Wallet connected')
    } catch (e: any) {
      toast.error(e.message || 'Connect failed')
    }
  }
  const short = wallet ? `${wallet.slice(0,6)}…${wallet.slice(-4)}` : 'Connect Wallet'
  return <button onClick={connect} className="btn-neon text-sm">{short}</button>
}
