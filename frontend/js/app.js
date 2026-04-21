/**
 * D.Bank UI — classic scripts (ethers UMD + embedded artifact).
 * No ES module CDN dependency so the app starts even if esm.sh is blocked.
 */
(function () {
  "use strict";

  const STORAGE_KEY = "dbank_contract_address";

  /** @type {{ abi: any[], networks: Record<string, { address: string }> } | null} */
  let artifact = null;
  /** @type {import("ethers").BrowserProvider | null} */
  let provider = null;
  /** @type {import("ethers").JsonRpcSigner | null} */
  let signer = null;
  /** @type {import("ethers").Contract | null} */
  let contract = null;
  let userAddress = null;
  /** @type {import("ethers").ethers | null} */
  let ethers = null;
  let MIN_WEI = 0n;

  const $ = (id) => document.getElementById(id);

  function fetchWithTimeout(url, ms) {
    const ctrl = new AbortController();
    const t = setTimeout(function () {
      ctrl.abort();
    }, ms);
    return fetch(url, { cache: "no-store", signal: ctrl.signal }).finally(function () {
      clearTimeout(t);
    });
  }

  function toast(msg, type) {
    type = type || "ok";
    const stack = $("toast-stack");
    if (!stack) return;
    const el = document.createElement("div");
    el.className = "toast toast--" + (type === "err" ? "err" : "ok");
    el.textContent = msg;
    stack.appendChild(el);
    setTimeout(function () {
      el.style.opacity = "0";
      el.style.transform = "translateX(8px)";
      setTimeout(function () {
        el.remove();
      }, 350);
    }, 5200);
  }

  function shortAddr(a) {
    if (!a || a.length < 12) return a || "—";
    return a.slice(0, 6) + "…" + a.slice(-4);
  }

  async function loadArtifact() {
    const status = $("el-artifact-status");
    if (window.__DBANK_ARTIFACT__ && window.__DBANK_ARTIFACT__.abi) {
      artifact = window.__DBANK_ARTIFACT__;
      var nets = Object.keys(artifact.networks || {}).length;
      status.textContent = nets
        ? "Ready — ABI from embedded artifact (" + nets + " deployment record(s))"
        : "Ready — embedded ABI (run migrate + npm run export:frontend for addresses)";
      return true;
    }

    status.textContent = "Loading ABI…";
    var url = new URL("js/artifact-lite.json", window.location.href).href;
    try {
      var res = await fetchWithTimeout(url, 8000);
      if (!res.ok) throw new Error("HTTP " + res.status);
      artifact = await res.json();
      nets = Object.keys(artifact.networks || {}).length;
      status.textContent = nets
        ? "Loaded ABI from network (" + nets + " deployment record(s))"
        : "Loaded ABI — add deployments with export:frontend";
      return true;
    } catch (e) {
      console.error(e);
      status.textContent =
        "Could not load ABI. Open this app via npm run serve (not file://) and run npm run export:frontend.";
      toast("ABI load failed — see status line under Contract", "err");
      return false;
    }
  }

  async function resolveContractAddress(prov) {
    var manual = (localStorage.getItem(STORAGE_KEY) || "").trim();
    if (manual && ethers.isAddress(manual)) return manual;

    if (!artifact || !artifact.networks) return null;

    var netVersion = null;
    try {
      netVersion = await prov.send("net_version", []);
    } catch (e) {
      /* ignore */
    }
    var net = await prov.getNetwork();
    var chainDec = Number(net.chainId);
    var keys = [netVersion, String(chainDec), String(Number(netVersion))].filter(Boolean);

    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      if (artifact.networks[k]) return artifact.networks[k].address;
    }

    var vals = Object.values(artifact.networks);
    if (vals.length === 1) return vals[0].address;
    return null;
  }

  async function wireContract(addr) {
    if (!artifact || !signer || !ethers.isAddress(addr)) return false;
    var code = await signer.provider.getCode(addr);
    if (code === "0x") {
      toast(
        "No contract code at this address. Use the DecentralizedBank address from your Truffle migrate output — not a Ganache account address.",
        "err"
      );
      return false;
    }
    contract = new ethers.Contract(addr, artifact.abi, signer);
    $("input-contract").value = addr;
    return true;
  }

  function setConnectedUi(connected) {
    var btn = $("btn-connect");
    btn.textContent = connected ? "Disconnect" : "Connect wallet";
    ["btn-deposit", "btn-withdraw", "btn-borrow", "btn-payoff"].forEach(function (id) {
      $(id).disabled = !connected;
    });
  }

  async function refreshBalances() {
    if (!provider || !userAddress) return;

    var bal = await provider.getBalance(userAddress);
    $("el-eth-balance").textContent = ethers.formatEther(bal) + " ETH";

    var net = await provider.getNetwork();
    var nv = await provider.send("net_version", []).catch(function () {
      return "?";
    });
    $("el-chain").textContent = "chain " + net.chainId + " · net " + nv;

    if (!contract) {
      $("pill-deposit").textContent = "no contract";
      $("pill-loan").textContent = "no contract";
      ["btn-deposit", "btn-withdraw", "btn-borrow", "btn-payoff"].forEach(function (id) {
        $(id).disabled = true;
      });
      return;
    }

    var deposited = await contract.isDeposited(userAddress);
    var balVault = await contract.etherBalanceOf(userAddress);
    var start = await contract.depositStart(userAddress);
    var borrowed = await contract.isBorrowed(userAddress);
    var coll = await contract.collateralEther(userAddress);

    $("pill-deposit").textContent = deposited ? "active" : "idle";
    $("pill-deposit").classList.toggle("pill--active", deposited);

    $("pill-loan").textContent = borrowed ? "loan open" : "no loan";
    $("pill-loan").classList.toggle("pill--active", borrowed);

    $("el-vault-balance").textContent = ethers.formatEther(balVault) + " ETH";
    $("el-deposit-since").textContent =
      deposited && start > 0n ? new Date(Number(start) * 1000).toLocaleString() : "—";
    $("el-collateral").textContent = ethers.formatEther(coll) + " ETH";

    $("btn-deposit").disabled = deposited;
    $("btn-withdraw").disabled = !deposited;
    $("btn-borrow").disabled = borrowed;
    $("btn-payoff").disabled = !borrowed;

    await refreshLog();
  }

  async function refreshLog() {
    var ul = $("el-log");
    ul.innerHTML = "";
    if (!contract || !userAddress) {
      ul.innerHTML = "<li>Connect wallet and set the contract address.</li>";
      return;
    }

    var types = ["Deposited", "Withdrawn", "Borrowed", "PaidOff"];
    var all = [];
    for (var t = 0; t < types.length; t++) {
      var name = types[t];
      var filter = contract.filters[name](userAddress);
      var chunk = await contract.queryFilter(filter, 0, "latest").catch(function () {
        return [];
      });
      all = all.concat(chunk);
    }
    all.sort(function (a, b) {
      var ba = BigInt(a.blockNumber || 0);
      var bb = BigInt(b.blockNumber || 0);
      if (ba < bb) return 1;
      if (ba > bb) return -1;
      return 0;
    });

    var seen = new Set();
    for (var i = 0; i < all.length && seen.size < 20; i++) {
      var log = all[i];
      var key = log.transactionHash + "-" + log.index;
      if (seen.has(key)) continue;
      seen.add(key);
      var li = document.createElement("li");
      var evName = "Event";
      var args = null;
      if ("fragment" in log && log.fragment && "args" in log) {
        evName = log.fragment.name;
        args = log.args;
      } else {
        try {
          var parsed = contract.interface.parseLog(log);
          evName = parsed.name;
          args = parsed.args;
        } catch (e) {
          continue;
        }
      }
      var detail = "";
      if (evName === "Deposited" && args && args.amount != null) {
        detail = ethers.formatEther(args.amount) + " ETH";
      } else if (evName === "Withdrawn" && args && args.amount != null) {
        detail = ethers.formatEther(args.amount) + " ETH";
      } else if (evName === "Borrowed" && args && args.amount != null) {
        detail = ethers.formatEther(args.amount) + " ETH";
      } else if (evName === "PaidOff" && args && args.amount != null) {
        detail = "fee " + ethers.formatEther(args.amount) + " ETH";
      }
      li.innerHTML = "<strong>" + evName + "</strong> · " + detail + " · block " + log.blockNumber;
      ul.appendChild(li);
    }
    if (!ul.children.length) {
      ul.innerHTML = "<li>No events for this wallet yet.</li>";
    }
  }

  function getConnMode() {
    var r = document.querySelector('input[name="conn-mode"]:checked');
    return r && r.value === "devkey" ? "devkey" : "metamask";
  }

  async function connectDev() {
    var pk = ($("input-dev-pk").value || "").trim();
    if (!pk) {
      toast("Paste a Ganache private key (0x…)", "err");
      return;
    }
    if (!pk.startsWith("0x")) {
      pk = "0x" + pk;
    }
    var rpcUrl = window.location.origin + "/rpc-proxy";
    try {
      var probe = await fetch(rpcUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_chainId", params: [] }),
      });
      if (!probe.ok) {
        throw new Error("HTTP " + probe.status);
      }
    } catch (e) {
      toast(
        "No /rpc-proxy here. Stop http-server and run: npm run dev — then reload this page.",
        "err"
      );
      return;
    }
    try {
      provider = new ethers.JsonRpcProvider(rpcUrl);
      signer = new ethers.Wallet(pk, provider);
    } catch (e) {
      console.error(e);
      toast("Invalid private key", "err");
      provider = null;
      signer = null;
      return;
    }
    userAddress = await signer.getAddress();
    $("el-address").textContent = userAddress + " (dev key)";
    setConnectedUi(true);
    toast("Connected via dev key — local prototype only");

    var rawInput = ($("input-contract").value || "").trim().toLowerCase();
    if (rawInput === userAddress.toLowerCase()) {
      toast(
        "That value is your wallet, not the contract. Paste DecentralizedBank from migrate / Ganache → Contracts.",
        "err"
      );
    }

    var addr = ($("input-contract").value || "").trim() || (await resolveContractAddress(provider));
    if (addr && (await wireContract(addr))) {
      toast("Using contract " + shortAddr(addr));
    } else {
      toast("Paste DecentralizedBank address, then Save", "err");
    }

    await refreshBalances();
  }

  async function connect() {
    if (signer) {
      provider = null;
      signer = null;
      contract = null;
      userAddress = null;
      $("el-address").textContent = "Not connected";
      $("input-dev-pk").value = "";
      setConnectedUi(false);
      toast("Disconnected");
      return;
    }

    if (getConnMode() === "devkey") {
      await connectDev();
      return;
    }

    if (!window.ethereum) {
      toast("Install MetaMask, or use Ganache private key mode with npm run dev", "err");
      return;
    }

    provider = new ethers.BrowserProvider(window.ethereum);
    await provider.send("eth_requestAccounts", []);
    signer = await provider.getSigner();
    userAddress = await signer.getAddress();

    $("el-address").textContent = userAddress;
    setConnectedUi(true);

    var rawInput = ($("input-contract").value || "").trim().toLowerCase();
    if (rawInput === userAddress.toLowerCase()) {
      toast(
        "That address is your wallet account, not the smart contract. Copy DecentralizedBank from the Truffle migrate terminal (or Ganache → Contracts).",
        "err"
      );
    }

    var addr = ($("input-contract").value || "").trim() || (await resolveContractAddress(provider));
    if (addr && (await wireContract(addr))) {
      toast("Using contract " + shortAddr(addr));
    } else {
      toast("Paste the DecentralizedBank contract address, then Save", "err");
    }

    await refreshBalances();
  }

  function parseAmountEth(input) {
    var s = String(input || "")
      .trim()
      .replace(",", ".");
    if (!s) throw new Error("Enter an amount");
    var v = ethers.parseEther(s);
    if (v < MIN_WEI) throw new Error("Minimum is " + ethers.formatEther(MIN_WEI) + " ETH");
    return v;
  }

  async function onDeposit() {
    try {
      var v = parseAmountEth($("input-deposit").value);
      var tx = await contract.deposit({ value: v });
      toast("Deposit sent · " + shortAddr(tx.hash));
      await tx.wait();
      toast("Deposit confirmed");
      await refreshBalances();
    } catch (e) {
      console.error(e);
      toast(e.shortMessage || e.reason || e.message || "Deposit failed", "err");
    }
  }

  async function onWithdraw() {
    try {
      var tx = await contract.withdraw();
      toast("Withdraw sent · " + shortAddr(tx.hash));
      await tx.wait();
      toast("Withdraw confirmed");
      await refreshBalances();
    } catch (e) {
      console.error(e);
      toast(e.shortMessage || e.reason || e.message || "Withdraw failed", "err");
    }
  }

  async function onBorrow() {
    try {
      var v = parseAmountEth($("input-borrow").value);
      var tx = await contract.borrow({ value: v });
      toast("Borrow sent · " + shortAddr(tx.hash));
      await tx.wait();
      toast("Borrow confirmed");
      await refreshBalances();
    } catch (e) {
      console.error(e);
      toast(e.shortMessage || e.reason || e.message || "Borrow failed", "err");
    }
  }

  async function onPayOff() {
    try {
      var tx = await contract.payOff();
      toast("Pay off sent · " + shortAddr(tx.hash));
      await tx.wait();
      toast("Loan closed");
      await refreshBalances();
    } catch (e) {
      console.error(e);
      toast(e.shortMessage || e.reason || e.message || "Pay off failed", "err");
    }
  }

  async function saveContractAddress() {
    var raw = ($("input-contract").value || "").trim();
    if (!ethers.isAddress(raw)) {
      toast("Invalid Ethereum address", "err");
      return;
    }
    if (userAddress && raw.toLowerCase() === userAddress.toLowerCase()) {
      toast("That is your wallet address. Paste the DecentralizedBank contract address instead.", "err");
      return;
    }
    localStorage.setItem(STORAGE_KEY, raw);
    if (signer && (await wireContract(raw))) {
      toast("Saved · contract wired");
      await refreshBalances();
    } else {
      toast("Saved · connect wallet to use", "ok");
    }
  }

  async function reloadArtifact() {
    var status = $("el-artifact-status");
    try {
      var url = new URL("js/artifact-lite.json?v=" + Date.now(), window.location.href).href;
      var res = await fetchWithTimeout(url, 8000);
      if (!res.ok) throw new Error("HTTP " + res.status);
      artifact = await res.json();
      var nets = Object.keys(artifact.networks || {}).length;
      status.textContent = "Reloaded from js/artifact-lite.json (" + nets + " deployment(s))";
    } catch (e) {
      if (window.__DBANK_ARTIFACT__ && window.__DBANK_ARTIFACT__.abi) {
        artifact = window.__DBANK_ARTIFACT__;
        status.textContent = "Using embedded artifact (network file not reachable)";
      } else {
        status.textContent = "Reload failed — run npm run export:frontend";
      }
    }
    if (signer) {
      var addr =
        (localStorage.getItem(STORAGE_KEY) || "").trim() || (await resolveContractAddress(provider));
      if (addr) await wireContract(addr);
      await refreshBalances();
    }
    toast("Artifact refresh done");
  }

  function setupNetworkDrawer() {
    var btn = $("btn-networks");
    var panel = $("network-panel");
    btn.addEventListener("click", function () {
      var open = panel.hidden;
      panel.hidden = !open;
      btn.setAttribute("aria-expanded", String(open));
    });
    document.querySelectorAll("[data-copy]").forEach(function (b) {
      b.addEventListener("click", function () {
        var t = b.getAttribute("data-copy");
        if (!t) return;
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(t).then(
            function () {
              toast("Copied");
            },
            function () {
              toast("Copy failed — select text manually", "err");
            }
          );
        } else {
          toast("Clipboard not available", "err");
        }
      });
    });
  }

  async function main() {
    if (!window.ethers) {
      $("el-artifact-status").textContent =
        "ethers.js failed to load. Check internet / ad blocker for cdn.jsdelivr.net, then refresh.";
      toast("Could not load ethers library", "err");
      return;
    }
    ethers = window.ethers;
    MIN_WEI = ethers.parseEther("0.01");

    await loadArtifact();

    if (window.ethereum) {
      window.ethereum.on &&
        window.ethereum.on("chainChanged", function () {
          window.location.reload();
        });
      window.ethereum.on &&
        window.ethereum.on("accountsChanged", function () {
          window.location.reload();
        });
    }

    $("btn-connect").addEventListener("click", connect);
    $("btn-deposit").addEventListener("click", onDeposit);
    $("btn-withdraw").addEventListener("click", onWithdraw);
    $("btn-borrow").addEventListener("click", onBorrow);
    $("btn-payoff").addEventListener("click", onPayOff);
    $("btn-save-contract").addEventListener("click", saveContractAddress);
    $("btn-reload-artifact").addEventListener("click", reloadArtifact);

    setupNetworkDrawer();

    var saved = localStorage.getItem(STORAGE_KEY);
    if (saved) $("input-contract").value = saved;

    setConnectedUi(false);
    $("btn-save-contract").disabled = false;
    $("btn-reload-artifact").disabled = false;

    window.__DBANK_READY = true;
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () {
      main().catch(function (e) {
        console.error(e);
        var st = document.getElementById("el-artifact-status");
        if (st) st.textContent = "Startup error — open DevTools console (F12).";
      });
    });
  } else {
    main().catch(function (e) {
      console.error(e);
      var st = document.getElementById("el-artifact-status");
      if (st) st.textContent = "Startup error — open DevTools console (F12).";
    });
  }
})();
