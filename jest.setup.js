// Mock environment variables for testing
process.env.PRIVATE_KEY = '0x0000000000000000000000000000000000000000000000000000000000000001'; // Test private key
process.env.L1_RPC = 'http://localhost:8545';
process.env.L2_RPC = 'http://localhost:8546';
process.env.L1BitcoinDepositor = '0x0000000000000000000000000000000000000001';
process.env.L2BitcoinDepositor = '0x0000000000000000000000000000000000000002';
process.env.TBTCVault = '0x0000000000000000000000000000000000000003'; 