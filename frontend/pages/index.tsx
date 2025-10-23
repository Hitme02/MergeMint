import Link from 'next/link';

const Home = () => {
  return (
    <main style={{ padding: 24, fontFamily: 'system-ui, sans-serif' }}>
      <h1>git-onchain-rewards</h1>
      <p>Welcome! Bind your wallet to your GitHub handle and claim rewards.</p>
      <ul>
        <li><Link href="/bind">Bind Wallet</Link></li>
        <li><Link href="/contributions">Your Contributions</Link></li>
      </ul>
    </main>
  );
};

export default Home;
