const chai = require('chai');

const server = require('./server');
const util = require('./util');

const expect = chai.expect;

describe('pay to presale address', () => {
    let defaultPoolArgs = [0, 0, 0, []];
    let creator;
    let buyer1;
    let buyer2;
    let payoutAddress;
    let web3;

    before(async () => {
        let result = await server.setUp();
        web3 = result.web3;
        creator = result.addresses[0].toLowerCase();
        buyer1 = result.addresses[1].toLowerCase();
        buyer2 = result.addresses[2].toLowerCase();
        payoutAddress = result.addresses[3].toLowerCase();
    });


    after(async () => {
        await server.tearDown();
    });

    let PresalePool;
    beforeEach(async () => {
        PresalePool = await util.deployContract(
            web3,
            "PresalePool",
            creator,
            util.createPoolArgs({
                maxContribution: web3.utils.toWei("50", "ether"),
                maxPoolBalance: web3.utils.toWei("50", "ether")
            })
        );
    });

    async function payToPresale(expectedPayout, minPoolTotal) {
        let beforeBalance = await web3.eth.getBalance(payoutAddress);

        await util.methodWithGas(
            PresalePool.methods.payToPresale(
                payoutAddress,
                minPoolTotal || expectedPayout
            ),
            creator
        );

        let afterBalance = await web3.eth.getBalance(payoutAddress);
        let difference = parseInt(afterBalance) - parseInt(beforeBalance);
        expect(difference / expectedPayout).to.be.within(.98, 1.0);
    }

    it("cant be called from failed state", async () => {
        await util.methodWithGas(PresalePool.methods.fail(), creator)

        await util.expectVMException(
            util.methodWithGas(PresalePool.methods.payToPresale(payoutAddress, 0), creator)
        );
    });

    it("can only be called by creator", async () => {
        await util.expectVMException(
            util.methodWithGas(PresalePool.methods.payToPresale(payoutAddress, 0), buyer1)
        );
    });

    it("fails if the receiving address does not accept the payment", async () => {
        await util.expectVMException(
            util.methodWithGas(
                PresalePool.methods.payToPresale(PresalePool.options.address, 0),
                creator
            )
        );
    });

    it("fails if the receiving address uses all the gas", async () => {
        let GasHungry = await util.deployContract(
            web3,
            "GasHungry",
            creator,
            []
        );
        await util.expectVMException(
            util.methodWithGas(
                PresalePool.methods.payToPresale(GasHungry.options.address, 0),
                creator
            )
        );
    });

    it("cant be called more than once", async () => {
        await util.methodWithGas(PresalePool.methods.payToPresale(payoutAddress, 0), creator)

        await util.expectVMException(
            util.methodWithGas(PresalePool.methods.payToPresale(payoutAddress, 0), creator)
        );
    });

    it("cant transition to failed state from paid state", async () => {
        await util.methodWithGas(PresalePool.methods.payToPresale(payoutAddress, 0), creator)

        await util.expectVMException(
            util.methodWithGas(PresalePool.methods.fail(), creator)
        );
    });

    it("does not accept deposits after a payout", async () => {
        await util.methodWithGas(PresalePool.methods.payToPresale(payoutAddress, 0), creator)
        await util.expectVMException(
            util.methodWithGas(
                PresalePool.methods.deposit(),
                buyer1,
                web3.utils.toWei("5", "ether")
            )
        );
    });

    it("respects min contribution", async () => {
        await util.methodWithGas(
            PresalePool.methods.deposit(),
            buyer1,
            web3.utils.toWei("5", "ether")
        );
        await util.methodWithGas(
            PresalePool.methods.deposit(),
            buyer2,
            web3.utils.toWei("1", "ether")
        );

        await util.methodWithGas(
            PresalePool.methods.setContributionSettings(
                web3.utils.toWei("2", "ether"),
                web3.utils.toWei("50", "ether"),
                web3.utils.toWei("50", "ether"),
                []
            ),
            creator
        )

        let expectedBalances = {}
        expectedBalances[buyer1] = {
            remaining: web3.utils.toWei("0", "ether"),
            contribution: web3.utils.toWei("5", "ether")
        }
        expectedBalances[buyer2] = {
            remaining: web3.utils.toWei("1", "ether"),
            contribution: web3.utils.toWei("0", "ether")
        }
        await util.verifyState(web3, PresalePool, expectedBalances, web3.utils.toWei("6", "ether"));
        await payToPresale(web3.utils.toWei("5", "ether"), 0);
        await util.verifyState(web3, PresalePool, expectedBalances, web3.utils.toWei("1", "ether"));

        let buyerBalance = await web3.eth.getBalance(buyer2);
        await util.methodWithGas(PresalePool.methods.withdrawAll(), buyer2);
        expectedBalances[buyer2].remaining = web3.utils.toWei("0", "ether");
        await util.verifyState(web3, PresalePool, expectedBalances, web3.utils.toWei("0", "ether"));

        let balanceAfterWithdrawl = await web3.eth.getBalance(buyer2);
        let difference = parseInt(balanceAfterWithdrawl) - parseInt(buyerBalance);
        expect(difference / web3.utils.toWei("1", "ether")).to.be.within(.98, 1.0);
    });

    it("respects max contribution", async () => {
        await util.methodWithGas(
            PresalePool.methods.deposit(),
            buyer1,
            web3.utils.toWei("5", "ether")
        );
        await util.methodWithGas(
            PresalePool.methods.deposit(),
            buyer2,
            web3.utils.toWei("1", "ether")
        );

        await util.methodWithGas(
            PresalePool.methods.setContributionSettings(
                0,
                web3.utils.toWei("2", "ether"),
                web3.utils.toWei("50", "ether"),
                []
            ),
            creator
        )

        let expectedBalances = {}
        expectedBalances[buyer1] = {
            remaining: web3.utils.toWei("3", "ether"),
            contribution: web3.utils.toWei("2", "ether")
        }
        expectedBalances[buyer2] = {
            remaining: web3.utils.toWei("0", "ether"),
            contribution: web3.utils.toWei("1", "ether")
        }
        await util.verifyState(web3, PresalePool, expectedBalances, web3.utils.toWei("6", "ether"));
        await payToPresale(web3.utils.toWei("3", "ether"), 0);
        await util.verifyState(web3, PresalePool, expectedBalances, web3.utils.toWei("3", "ether"));

        let buyerBalance = await web3.eth.getBalance(buyer1);
        await util.methodWithGas(PresalePool.methods.withdrawAll(), buyer1);
        expectedBalances[buyer1].remaining = web3.utils.toWei("0", "ether");
        await util.verifyState(web3, PresalePool, expectedBalances, web3.utils.toWei("0", "ether"));

        let balanceAfterWithdrawl = await web3.eth.getBalance(buyer1);
        let difference = parseInt(balanceAfterWithdrawl) - parseInt(buyerBalance);
        expect(difference / web3.utils.toWei("3", "ether")).to.be.within(.98, 1.0);
    });

    it("respects pool max", async () => {
        await util.methodWithGas(
            PresalePool.methods.deposit(),
            buyer1,
            web3.utils.toWei("5", "ether")
        );
        await util.methodWithGas(
            PresalePool.methods.deposit(),
            buyer2,
            web3.utils.toWei("1", "ether")
        );

        await util.methodWithGas(
            PresalePool.methods.setContributionSettings(
                0,
                web3.utils.toWei("2", "ether"),
                web3.utils.toWei("2", "ether"),
                []
            ),
            creator
        )

        let expectedBalances = {}
        expectedBalances[buyer1] = {
            remaining: web3.utils.toWei("3", "ether"),
            contribution: web3.utils.toWei("2", "ether")
        }
        expectedBalances[buyer2] = {
            remaining: web3.utils.toWei("1", "ether"),
            contribution: web3.utils.toWei("0", "ether")
        }
        await util.verifyState(web3, PresalePool, expectedBalances, web3.utils.toWei("6", "ether"));
        await payToPresale(web3.utils.toWei("2", "ether"), 0);
        await util.verifyState(web3, PresalePool, expectedBalances, web3.utils.toWei("4", "ether"));

        let buyerBalance = await web3.eth.getBalance(buyer1);
        //cant do partial withdrawls in paid state
        await util.expectVMException(
            util.methodWithGas(
                PresalePool.methods.withdraw(web3.utils.toWei("5", "ether")),
                buyer1
            )
        );
        await util.methodWithGas(
            PresalePool.methods.withdrawAll(),
            buyer1
        );
        expectedBalances[buyer1].remaining = web3.utils.toWei("0", "ether");
        await util.verifyState(web3, PresalePool, expectedBalances, web3.utils.toWei("1", "ether"));

        let balanceAfterWithdrawl = await web3.eth.getBalance(buyer1);
        let difference = parseInt(balanceAfterWithdrawl) - parseInt(buyerBalance);
        expect(difference / web3.utils.toWei("3", "ether")).to.be.within(.97, 1.0);
    });

    it("respects contribution settings", async () => {
        await util.methodWithGas(
            PresalePool.methods.deposit(),
            creator,
            web3.utils.toWei("2", "ether")
        );
        await util.methodWithGas(
            PresalePool.methods.deposit(),
            buyer1,
            web3.utils.toWei("5", "ether")
        );
        await util.methodWithGas(
            PresalePool.methods.deposit(),
            buyer2,
            web3.utils.toWei("1", "ether")
        );

        await util.methodWithGas(
            PresalePool.methods.setContributionSettings(
                0,
                web3.utils.toWei("2", "ether"),
                web3.utils.toWei("3", "ether"),
                []
            ),
            creator
        )

        let expectedBalances = {}
        expectedBalances[creator] = {
            remaining: web3.utils.toWei("0", "ether"),
            contribution: web3.utils.toWei("2", "ether")
        }
        expectedBalances[buyer1] = {
            remaining: web3.utils.toWei("4", "ether"),
            contribution: web3.utils.toWei("1", "ether")
        }
        expectedBalances[buyer2] = {
            remaining: web3.utils.toWei("1", "ether"),
            contribution: web3.utils.toWei("0", "ether")
        }
        await util.verifyState(web3, PresalePool, expectedBalances, web3.utils.toWei("8", "ether"));
        await payToPresale(web3.utils.toWei("3", "ether"), 0);
        await util.verifyState(web3, PresalePool, expectedBalances, web3.utils.toWei("5", "ether"));

        let buyerBalance = await web3.eth.getBalance(buyer1);
        await util.methodWithGas(PresalePool.methods.withdrawAll(), buyer1);
        expectedBalances[buyer1].remaining = web3.utils.toWei("0", "ether");
        await util.verifyState(web3, PresalePool, expectedBalances, web3.utils.toWei("1", "ether"));

        let balanceAfterWithdrawl = await web3.eth.getBalance(buyer1);
        let difference = parseInt(balanceAfterWithdrawl) - parseInt(buyerBalance);
        expect(difference / web3.utils.toWei("4", "ether")).to.be.within(.98, 1.0);
    });

    it("respects whitelist", async () => {
        await util.methodWithGas(
            PresalePool.methods.deposit(),
            buyer1,
            web3.utils.toWei("5", "ether")
        );
        await util.methodWithGas(
            PresalePool.methods.deposit(),
            buyer2,
            web3.utils.toWei("1", "ether")
        );

        await util.methodWithGas(PresalePool.methods.modifyWhitelist([], [buyer2]), creator)

        let expectedBalances = {}
        expectedBalances[buyer1] = {
            remaining: web3.utils.toWei("0", "ether"),
            contribution: web3.utils.toWei("5", "ether")
        }
        expectedBalances[buyer2] = {
            remaining: web3.utils.toWei("1", "ether"),
            contribution: web3.utils.toWei("0", "ether")
        }
        await util.verifyState(web3, PresalePool, expectedBalances, web3.utils.toWei("6", "ether"));
        await payToPresale(web3.utils.toWei("5", "ether"), 0);
        await util.verifyState(web3, PresalePool, expectedBalances, web3.utils.toWei("1", "ether"));

        let buyerBalance = await web3.eth.getBalance(buyer2);
        await util.methodWithGas(PresalePool.methods.withdrawAll(), buyer2);
        expectedBalances[buyer2].remaining = web3.utils.toWei("0", "ether");
        await util.verifyState(web3, PresalePool, expectedBalances, web3.utils.toWei("0", "ether"));

        let balanceAfterWithdrawl = await web3.eth.getBalance(buyer2);
        let difference = parseInt(balanceAfterWithdrawl) - parseInt(buyerBalance);
        expect(difference / web3.utils.toWei("1", "ether")).to.be.within(.98, 1.0);
    });

    it("fails if pool balance is less than minPoolTotal", async () => {
        await util.methodWithGas(
            PresalePool.methods.deposit(),
            buyer1,
            web3.utils.toWei("5", "ether")
        );
        await util.methodWithGas(
            PresalePool.methods.deposit(),
            buyer2,
            web3.utils.toWei("1", "ether")
        );

        let expectedBalances = {}
        expectedBalances[buyer1] = {
            remaining: web3.utils.toWei("0", "ether"),
            contribution: web3.utils.toWei("5", "ether")
        }
        expectedBalances[buyer2] = {
            remaining: web3.utils.toWei("0", "ether"),
            contribution: web3.utils.toWei("1", "ether")
        }
        await util.verifyState(web3, PresalePool, expectedBalances, web3.utils.toWei("6", "ether"));
        await util.expectVMException(
            util.methodWithGas(
                PresalePool.methods.payToPresale(
                    payoutAddress,
                    web3.utils.toWei("7", "ether")
                ),
                creator
            )
        );

        await util.methodWithGas(
            PresalePool.methods.setContributionSettings(
                0,
                web3.utils.toWei("2", "ether"),
                web3.utils.toWei("50", "ether"),
                []
            ),
            creator
        );
        expectedBalances[buyer1] = {
            remaining: web3.utils.toWei("3", "ether"),
            contribution: web3.utils.toWei("2", "ether")
        }
        await util.verifyState(web3, PresalePool, expectedBalances, web3.utils.toWei("6", "ether"));
        await util.expectVMException(
            util.methodWithGas(
                PresalePool.methods.payToPresale(
                    payoutAddress,
                    web3.utils.toWei("6", "ether")
                ),
                creator
            )
        );

        await payToPresale(web3.utils.toWei("3", "ether"), web3.utils.toWei("3", "ether"));
    });
});

