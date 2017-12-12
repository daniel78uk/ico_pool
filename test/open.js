const chai = require('chai');

const server = require('./server');
const util = require('./util');

const expect = chai.expect;

describe('open state', () => {
    let creator;
    let buyer1;
    let buyer2;
    let web3;

    before(async () => {
        let result = await server.setUp();
        web3 = result.web3;
        creator = result.addresses[0].toLowerCase();
        buyer1 = result.addresses[1].toLowerCase();
        buyer2 = result.addresses[2].toLowerCase();
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

    it('accepts deposits', async () => {
        await util.methodWithGas(
            PresalePool.methods.deposit(),
            buyer1,
            web3.utils.toWei("5", "ether")
        );

        await util.methodWithGas(
            PresalePool.methods.deposit(),
            buyer1,
            web3.utils.toWei("5", "ether")
        );

        await util.methodWithGas(
            PresalePool.methods.deposit(),
            buyer2,
            web3.utils.toWei("3", "ether")
        );

        let expectedBalances = {}
        expectedBalances[buyer1] = {
            remaining: web3.utils.toWei("0", "ether"),
            contribution: web3.utils.toWei("10", "ether")
        }
        expectedBalances[buyer2] = {
            remaining: web3.utils.toWei("0", "ether"),
            contribution: web3.utils.toWei("3", "ether")
        }
        await util.verifyState(web3, PresalePool, expectedBalances, web3.utils.toWei("13", "ether"));
    });

    it('performs full withdrawls', async () => {
        await util.methodWithGas(
            PresalePool.methods.deposit(),
            buyer1,
            web3.utils.toWei("5", "ether")
        );

        let expectedBalances = {}
        expectedBalances[buyer1] = {
            remaining: web3.utils.toWei("0", "ether"),
            contribution: web3.utils.toWei("5", "ether")
        }
        await util.verifyState(web3, PresalePool, expectedBalances, web3.utils.toWei("5", "ether"));
        let buyerBalance = await web3.eth.getBalance(buyer1);
        await util.methodWithGas(PresalePool.methods.withdrawAll(), buyer1);
        expectedBalances[buyer1].contribution = web3.utils.toWei("0", "ether");
        await util.verifyState(web3, PresalePool, expectedBalances, web3.utils.toWei("0", "ether"));

        let buyerBalanceAfterRefund = await web3.eth.getBalance(buyer1);
        let difference = parseInt(buyerBalanceAfterRefund) - parseInt(buyerBalance);
        expect(difference / web3.utils.toWei("5", "ether")).to.be.within(.98, 1.0);
    });

    it('allows withdrawls', async () => {
        await util.methodWithGas(
            PresalePool.methods.deposit(),
            buyer1,
            web3.utils.toWei("5", "ether")
        );

        let expectedBalances = {}
        expectedBalances[buyer1] = {
            remaining: web3.utils.toWei("0", "ether"),
            contribution: web3.utils.toWei("5", "ether")
        }
        await util.verifyState(web3, PresalePool, expectedBalances, web3.utils.toWei("5", "ether"));
        let buyerBalance = await web3.eth.getBalance(buyer1);

        await util.methodWithGas(PresalePool.methods.withdraw(web3.utils.toWei("4", "ether")), buyer1);

        expectedBalances[buyer1].contribution = web3.utils.toWei("1", "ether");
        await util.verifyState(web3, PresalePool, expectedBalances, web3.utils.toWei("1", "ether"));

        let buyerBalanceAfterRefund = await web3.eth.getBalance(buyer1);
        let difference = parseInt(buyerBalanceAfterRefund) - parseInt(buyerBalance);
        expect(difference / web3.utils.toWei("4", "ether")).to.be.within(.98, 1.0);
    });

    it('does not refund participants without deposits', async () => {
        await util.methodWithGas(
            PresalePool.methods.deposit(),
            buyer1,
            web3.utils.toWei("5", "ether")
        );

        await util.methodWithGas(PresalePool.methods.withdrawAll(), buyer2);

        let expectedBalances = {}
        expectedBalances[buyer1] = {
            remaining: web3.utils.toWei("0", "ether"),
            contribution: web3.utils.toWei("5", "ether")
        }
        await util.verifyState(web3, PresalePool, expectedBalances, web3.utils.toWei("5", "ether"));
    });

    it('does not allow participants to withdraw more than their deposits', async () => {
        await util.methodWithGas(
            PresalePool.methods.deposit(),
            buyer1,
            web3.utils.toWei("5", "ether")
        );

        await util.methodWithGas(
            PresalePool.methods.deposit(),
            buyer2,
            web3.utils.toWei("3", "ether")
        );

        let expectedBalances = {}
        expectedBalances[buyer1] = {
            remaining: web3.utils.toWei("0", "ether"),
            contribution: web3.utils.toWei("5", "ether")
        }
        expectedBalances[buyer2] = {
            remaining: web3.utils.toWei("0", "ether"),
            contribution: web3.utils.toWei("3", "ether")
        }
        await util.verifyState(web3, PresalePool, expectedBalances, web3.utils.toWei("8", "ether"));

        await util.expectVMException(
            util.methodWithGas(
                PresalePool.methods.withdraw(web3.utils.toWei("4", "ether")),
                buyer2
            )
        );
    });

    it('does not allow a withdrawl to result in a balance less than minContribution', async () => {
        await util.methodWithGas(
            PresalePool.methods.deposit(),
            buyer1,
            web3.utils.toWei("5", "ether")
        );
        await util.methodWithGas(
            PresalePool.methods.deposit(),
            buyer2,
            web3.utils.toWei("3", "ether")
        );

        let expectedBalances = {}
        expectedBalances[buyer1] = {
            remaining: web3.utils.toWei("0", "ether"),
            contribution: web3.utils.toWei("5", "ether")
        }
        expectedBalances[buyer2] = {
            remaining: web3.utils.toWei("0", "ether"),
            contribution: web3.utils.toWei("3", "ether")
        }
        await util.verifyState(web3, PresalePool, expectedBalances, web3.utils.toWei("8", "ether"));

        await util.methodWithGas(
            PresalePool.methods.setContributionSettings(
                web3.utils.toWei("2", "ether"),
                web3.utils.toWei("50", "ether"),
                web3.utils.toWei("50", "ether"),
                []
            ),
            creator
        )
        await util.verifyState(web3, PresalePool, expectedBalances, web3.utils.toWei("8", "ether"));

        await util.expectVMException(
            util.methodWithGas(
                PresalePool.methods.withdraw(web3.utils.toWei("2", "ether")),
                buyer2
            )
        );

        await util.methodWithGas(
            PresalePool.methods.withdraw(web3.utils.toWei("3", "ether")),
            buyer1
        )
        expectedBalances[buyer1].contribution = web3.utils.toWei("2", "ether");
        await util.verifyState(web3, PresalePool, expectedBalances, web3.utils.toWei("5", "ether"));

        await util.methodWithGas(
            PresalePool.methods.withdrawAll(),
            buyer2
        )
        expectedBalances[buyer2].contribution = web3.utils.toWei("0", "ether");
        await util.verifyState(web3, PresalePool, expectedBalances, web3.utils.toWei("2", "ether"));
    });

    it('does not allow a withdrawl to result in a balance greater than maxContribution', async () => {
        await util.methodWithGas(
            PresalePool.methods.deposit(),
            buyer1,
            web3.utils.toWei("5", "ether")
        );
        await util.methodWithGas(
            PresalePool.methods.deposit(),
            buyer2,
            web3.utils.toWei("3", "ether")
        );

        let expectedBalances = {}
        expectedBalances[buyer1] = {
            remaining: web3.utils.toWei("0", "ether"),
            contribution: web3.utils.toWei("5", "ether")
        }
        expectedBalances[buyer2] = {
            remaining: web3.utils.toWei("0", "ether"),
            contribution: web3.utils.toWei("3", "ether")
        }
        await util.verifyState(web3, PresalePool, expectedBalances, web3.utils.toWei("8", "ether"));

        await util.methodWithGas(
            PresalePool.methods.setContributionSettings(
                0,
                web3.utils.toWei("2", "ether"),
                web3.utils.toWei("50", "ether"),
                []
            ),
            creator
        )
        expectedBalances[buyer1] = {
            remaining: web3.utils.toWei("3", "ether"),
            contribution: web3.utils.toWei("2", "ether")
        }
        expectedBalances[buyer2] = {
            remaining: web3.utils.toWei("1", "ether"),
            contribution: web3.utils.toWei("2", "ether")
        }
        await util.verifyState(web3, PresalePool, expectedBalances, web3.utils.toWei("8", "ether"));

        await util.expectVMException(
            util.methodWithGas(
                PresalePool.methods.withdraw(web3.utils.toWei("2", "ether")),
                buyer1
            )
        );
        await util.methodWithGas(
            PresalePool.methods.withdraw(web3.utils.toWei("3", "ether")),
            buyer1
        );
        expectedBalances[buyer1].remaining = web3.utils.toWei("0", "ether");
        await util.verifyState(web3, PresalePool, expectedBalances, web3.utils.toWei("5", "ether"));

        await util.methodWithGas(
            PresalePool.methods.withdrawAll(),
            buyer2
        );
        expectedBalances[buyer2].contribution = web3.utils.toWei("0", "ether");
        expectedBalances[buyer2].remaining = web3.utils.toWei("0", "ether");
        await util.verifyState(web3, PresalePool, expectedBalances, web3.utils.toWei("2", "ether"));

        await util.methodWithGas(
            PresalePool.methods.withdrawAll(),
            buyer2
        );
        await util.verifyState(web3, PresalePool, expectedBalances, web3.utils.toWei("2", "ether"));
    });

    it('does not allow a withdrawl to result in a pool balance greater than maxPoolTotal', async () => {
        await util.methodWithGas(
            PresalePool.methods.deposit(),
            buyer1,
            web3.utils.toWei("5", "ether")
        );
        await util.methodWithGas(
            PresalePool.methods.deposit(),
            buyer2,
            web3.utils.toWei("3", "ether")
        );

        let expectedBalances = {}
        expectedBalances[buyer1] = {
            remaining: web3.utils.toWei("0", "ether"),
            contribution: web3.utils.toWei("5", "ether")
        }
        expectedBalances[buyer2] = {
            remaining: web3.utils.toWei("0", "ether"),
            contribution: web3.utils.toWei("3", "ether")
        }
        await util.verifyState(web3, PresalePool, expectedBalances, web3.utils.toWei("8", "ether"));

        await util.methodWithGas(
            PresalePool.methods.setContributionSettings(
                0,
                web3.utils.toWei("2", "ether"),
                web3.utils.toWei("2", "ether"),
                []
            ),
            creator
        )
        expectedBalances[buyer1] = {
            remaining: web3.utils.toWei("3", "ether"),
            contribution: web3.utils.toWei("2", "ether")
        }
        expectedBalances[buyer2] = {
            remaining: web3.utils.toWei("3", "ether"),
            contribution: web3.utils.toWei("0", "ether")
        }
        await util.verifyState(web3, PresalePool, expectedBalances, web3.utils.toWei("8", "ether"));

        await util.expectVMException(
            util.methodWithGas(
                PresalePool.methods.withdraw(web3.utils.toWei("2", "ether")),
                buyer1
            )
        );
        await util.methodWithGas(
            PresalePool.methods.withdraw(web3.utils.toWei("3", "ether")),
            buyer1
        )
        expectedBalances[buyer1].remaining = web3.utils.toWei("0", "ether");
        await util.verifyState(web3, PresalePool, expectedBalances, web3.utils.toWei("5", "ether"));
    });

    it('can transition to failed state', async () => {
        await util.methodWithGas(
            PresalePool.methods.deposit(),
            buyer1,
            web3.utils.toWei("5", "ether")
        );

        // can only be performed by creator
        await util.expectVMException(
            util.methodWithGas(PresalePool.methods.fail(), buyer2)
        );
        await util.methodWithGas(PresalePool.methods.fail(), creator);

        await util.expectVMException(
            util.methodWithGas(
                PresalePool.methods.deposit(),
                buyer2,
                web3.utils.toWei("3", "ether")
            )
        );

        let expectedBalances = {}
        expectedBalances[buyer1] = {
            remaining: web3.utils.toWei("0", "ether"),
            contribution: web3.utils.toWei("5", "ether")
        }
        await util.verifyState(web3, PresalePool, expectedBalances, web3.utils.toWei("5", "ether"));

        await util.expectBalanceChange(web3, buyer1, web3.utils.toWei("5", "ether"), () =>{
            return util.methodWithGas(
                PresalePool.methods.withdrawAll(),
                buyer1
            );
        });

        await util.expectVMException(
            util.methodWithGas(PresalePool.methods.payToPresale(creator, 1), creator)
        );
    });
});

