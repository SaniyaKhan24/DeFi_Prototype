module.exports = {
  networks: {
    development: {
      host: "127.0.0.1",
      port: 8545,
      network_id: "*" // Match any network id
    },
    development_gui: {
      host: "127.0.0.1",
      port: 7545,
      network_id: "*"
    }
  }
};

// Configure your compilers
module.exports.compilers = {
  solc: {
    version: "0.6.12", // Fetch exact version from solc-bin (default: truffle's version)
    settings: {
      optimizer: {
        enabled: true,
        runs: 200
      }
    }
  }
};
