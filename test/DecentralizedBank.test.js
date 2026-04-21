const DecentralizedBank = artifacts.require("DecentralizedBank");

contract("DecentralizedBank", accounts => {
  const [owner, user] = accounts;

  let dbank;

  beforeEach(async () => {
    dbank = await DecentralizedBank.new({ from: owner });
  });

  it("should accept deposits and set state", async () => {
    const depositValue = web3.utils.toWei('0.02', 'ether');

    await dbank.deposit({ from: user, value: depositValue });

    const isDeposited = await dbank.isDeposited(user);
    const balance = await dbank.etherBalanceOf(user);

    assert.equal(isDeposited, true, "user should be marked as deposited");
    assert.equal(balance.toString(), depositValue, "balance should equal deposited value");
  });

  it("emits Deposited event on deposit", async () => {
    const depositValue = web3.utils.toWei('0.01', 'ether');
    const res = await dbank.deposit({ from: user, value: depositValue });
    assert.exists(res.receipt, 'transaction should have receipt');
    const logs = res.logs || [];
    const found = logs.find(l => l.event === 'Deposited');
    assert.ok(found, 'Deposited event should be emitted');
    assert.equal(found.args.user, user);
    assert.equal(found.args.amount.toString(), depositValue);
  });

  it("should allow withdraw and reset state", async () => {
    const depositValue = web3.utils.toWei('0.02', 'ether');

    // ensure deposit exists
    await dbank.deposit({ from: user, value: depositValue });

    // withdraw
    const res = await dbank.withdraw({ from: user });

    // event check
    const found = res.logs.find(l => l.event === 'Withdrawn');
    assert.ok(found, 'Withdrawn event should be emitted');
    assert.equal(found.args.user, user);
    assert.equal(found.args.amount.toString(), depositValue);

    const isDeposited = await dbank.isDeposited(user);
    const balance = await dbank.etherBalanceOf(user);

    assert.equal(isDeposited, false, "deposit status should be reset");
    assert.equal(balance.toString(), '0', "etherBalanceOf should be zero after withdraw");
  });

  it("should allow borrowing (lock collateral) and pay off loan", async () => {
    const collateral = web3.utils.toWei('0.02', 'ether');

    await dbank.borrow({ from: user, value: collateral });

    let isBorrowed = await dbank.isBorrowed(user);
    let locked = await dbank.collateralEther(user);

    assert.equal(isBorrowed, true, 'user should be marked as borrowed');
    assert.equal(locked.toString(), collateral, 'collateral should equal value sent');

    // pay off
    const res = await dbank.payOff({ from: user });

    const found = res.logs.find(l => l.event === 'PaidOff');
    assert.ok(found, 'PaidOff event should be emitted');

    isBorrowed = await dbank.isBorrowed(user);
    locked = await dbank.collateralEther(user);

    assert.equal(isBorrowed, false, 'borrow status should be cleared');
    assert.equal(locked.toString(), '0', 'collateral should be zero after payOff');
  });

  it('rejects deposits below minimum', async () => {
    const small = web3.utils.toWei('0.001', 'ether');
    try {
      await dbank.deposit({ from: user, value: small });
      assert.fail('deposit below minimum should revert');
    } catch (err) {
      assert.include(err.message, 'revert', 'should be revert');
    }
  });

  it('rejects withdraw without deposit', async () => {
    try {
      await dbank.withdraw({ from: user });
      assert.fail('withdraw without deposit should revert');
    } catch (err) {
      assert.include(err.message, 'revert', 'should be revert');
    }
  });

  it('rejects borrowing twice', async () => {
    const collateral = web3.utils.toWei('0.01', 'ether');
    await dbank.borrow({ from: user, value: collateral });
    try {
      await dbank.borrow({ from: user, value: collateral });
      assert.fail('second borrow should revert');
    } catch (err) {
      assert.include(err.message, 'revert', 'should be revert');
    }
  });

  it('rejects payOff when no loan active', async () => {
    try {
      await dbank.payOff({ from: user });
      assert.fail('payOff without loan should revert');
    } catch (err) {
      assert.include(err.message, 'revert', 'should be revert');
    }
  });
});
