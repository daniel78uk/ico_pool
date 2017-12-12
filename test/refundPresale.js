const chai = require('chai');

const server = require('./server');
const util = require('./util');

const expect = chai.expect;

describe('expectRefund', () => {
    let creator;
    let buyer1;
    let buyer2;
    let teamMember;
    let web3;

    before(async () => {
        let result = await server.setUp();
        web3 = result.web3;
        creator = result.addresses[0].toLowerCase();
        buyer1 = result.addresses[1].toLowerCase();
        buyer2 = result.addresses[2].toLowerCase();
        teamMember = result.addresses[3].toLowerCase();
        payoutAddress = result.addresses[4].toLowerCase();
    });


    after(async () => {
        await server.tearDown();
    });


    function assertRefund(PresalePool, participant, expectedDifference) {
        return util.expectBalanceChange(web3, participant, expectedDifference, () =>{
            return util.methodWithGas(
                PresalePool.methods.withdrawAll(), participant
            );
        });
    }

    it("cant be called from open state", async () => {
        let PresalePool = await util.deployContract(
            web3,
            "PresalePool",
            creator,
            util.createPoolArgs({
                maxContribution: web3.utils.toWei("50", "ether"),
                maxPoolBalance: web3.utils.toWei("50", "ether")
            })
        );

        await util.expectVMException(
            util.methodWithGas(
                PresalePool.methods.expectRefund(payoutAddress),
                creator
            )
        );

        await util.expectVMException(
            web3.eth.sendTransaction({
                from: payoutAddress,
                to: PresalePool.options.address,
                value: web3.utils.toWei("3", "ether")
            })
        );
    });

    it("cant be called from failed state", async () => {
        let PresalePool = await util.deployContract(
            web3,
            "PresalePool",
            creator,
            util.createPoolArgs({
                maxContribution: web3.utils.toWei("50", "ether"),
                maxPoolBalance: web3.utils.toWei("50", "ether")
            })
        );

        await util.methodWithGas(PresalePool.methods.fail(), creator);

        await util.expectVMException(
            util.methodWithGas(
                PresalePool.methods.expectRefund(payoutAddress),
                creator
            )
        );

        await util.expectVMException(
            web3.eth.sendTransaction({
                from: payoutAddress,
                to: PresalePool.options.address,
                value: web3.utils.toWei("3", "ether")
            })
        );
    });

    it("refund state does not allow deposits", async () => {
        let PresalePool = await util.deployContract(
            web3,
            "PresalePool",
            creator,
            util.createPoolArgs({
                maxContribution: web3.utils.toWei("50", "ether"),
                maxPoolBalance: web3.utils.toWei("50", "ether")
            })
        );

        await util.methodWithGas(
            PresalePool.methods.deposit(),
            creator,
            web3.utils.toWei("2", "ether")
        );
        await util.methodWithGas(
            PresalePool.methods.payToPresale(payoutAddress, 0),
            creator
        );
        await util.methodWithGas(
            PresalePool.methods.expectRefund(buyer2),
            creator
        );

        await util.expectVMException(
            util.methodWithGas(
                PresalePool.methods.deposit(),
                buyer2,
                web3.utils.toWei("2", "ether")
            )
        );
    });

    it("refund transactions fail if address does not match refundSenderAddress", async () => {
        let PresalePool = await util.deployContract(
            web3,
            "PresalePool",
            creator,
            util.createPoolArgs({
                maxContribution: web3.utils.toWei("50", "ether"),
                maxPoolBalance: web3.utils.toWei("50", "ether")
            })
        );

        await util.methodWithGas(
            PresalePool.methods.deposit(),
            creator,
            web3.utils.toWei("2", "ether")
        );
        await util.methodWithGas(
            PresalePool.methods.payToPresale(payoutAddress, 0),
            creator
        );
        await util.methodWithGas(
            PresalePool.methods.expectRefund(buyer2),
            creator
        );

        await util.expectVMException(
            web3.eth.sendTransaction({
                from: payoutAddress,
                to: PresalePool.options.address,
                value: web3.utils.toWei("2", "ether")
            })
        );

        await util.expectVMException(
            web3.eth.sendTransaction({
                from: creator,
                to: PresalePool.options.address,
                value: web3.utils.toWei("2", "ether")
            })
        );

        await web3.eth.sendTransaction({
            from: buyer2,
            to: PresalePool.options.address,
            value: web3.utils.toWei("2", "ether")
        });
    });

    it("accepts multiple refund transactions", async () => {
        let PresalePool = await util.deployContract(
            web3,
            "PresalePool",
            creator,
            util.createPoolArgs({
                maxContribution: web3.utils.toWei("50", "ether"),
                maxPoolBalance: web3.utils.toWei("50", "ether")
            })
        );

        await util.methodWithGas(
            PresalePool.methods.deposit(),
            buyer2,
            web3.utils.toWei("3", "ether")
        );
        await util.methodWithGas(
            PresalePool.methods.deposit(),
            buyer1,
            web3.utils.toWei("1", "ether")
        );
        await util.methodWithGas(
            PresalePool.methods.payToPresale(payoutAddress, 0),
            creator
        );
        await util.methodWithGas(
            PresalePool.methods.expectRefund(payoutAddress),
            creator
        );

        await web3.eth.sendTransaction({
            from: payoutAddress,
            to: PresalePool.options.address,
            value: web3.utils.toWei("1", "ether")
        });

        await assertRefund(PresalePool, buyer2, web3.utils.toWei("0.75", "ether"));
        await assertRefund(PresalePool, buyer2, 0);

        await web3.eth.sendTransaction({
            from: payoutAddress,
            to: PresalePool.options.address,
            value: web3.utils.toWei("3", "ether")
        });

        await assertRefund(PresalePool, buyer2, web3.utils.toWei("2.25", "ether"));
        await assertRefund(PresalePool, buyer2, 0);
        await assertRefund(PresalePool, buyer1, web3.utils.toWei("1", "ether"));
        await assertRefund(PresalePool, buyer1, 0);
    });

    it("accepts multiple refund transactions from different senders", async () => {
        let PresalePool = await util.deployContract(
            web3,
            "PresalePool",
            creator,
            util.createPoolArgs({
                maxContribution: web3.utils.toWei("50", "ether"),
                maxPoolBalance: web3.utils.toWei("50", "ether")
            })
        );

        await util.methodWithGas(
            PresalePool.methods.deposit(),
            buyer2,
            web3.utils.toWei("3", "ether")
        );
        await util.methodWithGas(
            PresalePool.methods.deposit(),
            buyer1,
            web3.utils.toWei("1", "ether")
        );
        await util.methodWithGas(
            PresalePool.methods.payToPresale(payoutAddress, 0),
            creator
        );

        await util.methodWithGas(
            PresalePool.methods.expectRefund(payoutAddress),
            creator
        );
        await web3.eth.sendTransaction({
            from: payoutAddress,
            to: PresalePool.options.address,
            value: web3.utils.toWei("1", "ether")
        });

        await assertRefund(PresalePool, buyer2, web3.utils.toWei("0.75", "ether"));
        await assertRefund(PresalePool, buyer2, 0);

        await util.methodWithGas(
            PresalePool.methods.expectRefund(creator),
            creator
        );
        await util.expectVMException(
            web3.eth.sendTransaction({
                from: payoutAddress,
                to: PresalePool.options.address,
                value: web3.utils.toWei("3", "ether")
            })
        );
        await web3.eth.sendTransaction({
            from: creator,
            to: PresalePool.options.address,
            value: web3.utils.toWei("3", "ether")
        });

        await assertRefund(PresalePool, buyer2, web3.utils.toWei("2.25", "ether"));
        await assertRefund(PresalePool, buyer2, 0);
        await assertRefund(PresalePool, buyer1, web3.utils.toWei("1", "ether"));
        await assertRefund(PresalePool, buyer1, 0);
    });

    it("allow refunds if token is set", async () => {
        let PresalePool = await util.deployContract(
            web3,
            "PresalePool",
            creator,
            util.createPoolArgs({
                maxContribution: web3.utils.toWei("50", "ether"),
                maxPoolBalance: web3.utils.toWei("50", "ether")
            })
        );

        await util.methodWithGas(
            PresalePool.methods.deposit(),
            creator,
            web3.utils.toWei("2", "ether")
        );

        let TestToken = await util.deployContract(web3, "TestToken", creator, [buyer2]);
        await util.methodWithGas(
            PresalePool.methods.payToPresale(TestToken.options.address, 0),
            creator
        );

        await util.methodWithGas(
            PresalePool.methods.setToken(
                TestToken.options.address,
                true
            ),
            creator
        );

        await util.methodWithGas(
            PresalePool.methods.expectRefund(payoutAddress),
            creator
        );

        await util.expectVMException(
            util.methodWithGas(
                PresalePool.methods.transferTokensTo([creator]),
                creator
            )
        );

        await web3.eth.sendTransaction({
            from: payoutAddress,
            to: PresalePool.options.address,
            value: web3.utils.toWei("3", "ether")
        });

        await assertRefund(PresalePool, creator, web3.utils.toWei("3", "ether"));
    });

    it("dont allow refunds if tokens have been claimed", async () => {
        let PresalePool = await util.deployContract(
            web3,
            "PresalePool",
            creator,
            util.createPoolArgs({
                maxContribution: web3.utils.toWei("50", "ether"),
                maxPoolBalance: web3.utils.toWei("50", "ether")
            })
        );

        await util.methodWithGas(
            PresalePool.methods.deposit(),
            creator,
            web3.utils.toWei("2", "ether")
        );

        let TestToken = await util.deployContract(web3, "TestToken", creator, [buyer2]);
        await util.methodWithGas(
            PresalePool.methods.payToPresale(TestToken.options.address, 0),
            creator
        );

        await util.methodWithGas(
            PresalePool.methods.setToken(
                TestToken.options.address,
                true
            ),
            creator
        );

        await util.methodWithGas(
            PresalePool.methods.transferTokensTo([creator]),
            creator
        );

        await util.expectVMException(
            util.methodWithGas(
                PresalePool.methods.expectRefund(payoutAddress),
                creator
            )
        );

        await util.expectVMException(
            web3.eth.sendTransaction({
                from: payoutAddress,
                to: PresalePool.options.address,
                value: web3.utils.toWei("3", "ether")
            })
        );
    });

    it("allow refunds which exceed original amount", async () => {
        let PresalePool = await util.deployContract(
            web3,
            "PresalePool",
            creator,
            util.createPoolArgs({
                maxContribution: web3.utils.toWei("50", "ether"),
                maxPoolBalance: web3.utils.toWei("50", "ether")
            })
        );

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

        let expectedBalances = {}
        expectedBalances[creator] = {
            remaining: web3.utils.toWei("0", "ether"),
            contribution: web3.utils.toWei("2", "ether")
        }
        expectedBalances[buyer1] = {
            remaining: web3.utils.toWei("0", "ether"),
            contribution: web3.utils.toWei("5", "ether")
        }
        expectedBalances[buyer2] = {
            remaining: web3.utils.toWei("0", "ether"),
            contribution: web3.utils.toWei("1", "ether")
        }
        await util.verifyState(web3, PresalePool, expectedBalances, web3.utils.toWei("8", "ether"));

        await util.methodWithGas(
            PresalePool.methods.setContributionSettings(
                0, web3.utils.toWei("2", "ether"), web3.utils.toWei("3", "ether"), []
            ),
            creator
        )
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

        await util.methodWithGas(
            PresalePool.methods.payToPresale(payoutAddress, 0),
            creator
        );

        await util.methodWithGas(
            PresalePool.methods.expectRefund(payoutAddress),
            creator
        );

        await web3.eth.sendTransaction({
            from: payoutAddress,
            to: PresalePool.options.address,
            value: web3.utils.toWei("63", "ether")
        });

        await assertRefund(PresalePool, creator, web3.utils.toWei("42", "ether"))
        await assertRefund(PresalePool, buyer1, web3.utils.toWei("25", "ether"))
        await assertRefund(PresalePool, buyer2, web3.utils.toWei("1", "ether"))
    });

    it("allows refunds even if the pool is configured with fees", async () => {
        let FeeManager = await util.deployContract(
            web3,
            "PBFeeManager",
            creator,
            [[teamMember]]
        );

        let PresalePool = await util.deployContract(
            web3,
            "PresalePool",
            creator,
            util.createPoolArgs({
                feesPerEther: web3.utils.toWei("0.25", "ether"),
                feeManager: FeeManager.options.address,
                maxContribution: web3.utils.toWei("50", "ether"),
                maxPoolBalance: web3.utils.toWei("50", "ether")
            })
        );


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

        let expectedBalances = {}
        expectedBalances[creator] = {
            remaining: web3.utils.toWei("0", "ether"),
            contribution: web3.utils.toWei("2", "ether")
        }
        expectedBalances[buyer1] = {
            remaining: web3.utils.toWei("0", "ether"),
            contribution: web3.utils.toWei("5", "ether")
        }
        expectedBalances[buyer2] = {
            remaining: web3.utils.toWei("0", "ether"),
            contribution: web3.utils.toWei("1", "ether")
        }
        await util.verifyState(web3, PresalePool, expectedBalances, web3.utils.toWei("8", "ether"));

        await util.methodWithGas(
            PresalePool.methods.setContributionSettings(
                0, web3.utils.toWei("2", "ether"), web3.utils.toWei("3", "ether"), []
            ),
            creator
        )
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

        await util.methodWithGas(
            PresalePool.methods.payToPresale(payoutAddress, 0),
            creator
        );

        await util.methodWithGas(
            PresalePool.methods.expectRefund(payoutAddress),
            creator
        );

        await web3.eth.sendTransaction({
            from: payoutAddress,
            to: PresalePool.options.address,
            value: web3.utils.toWei("2.25", "ether")
        });

        await assertRefund(PresalePool, creator, web3.utils.toWei("2", "ether"))
        await assertRefund(PresalePool, buyer1, web3.utils.toWei("5", "ether"))
        await assertRefund(PresalePool, buyer2, web3.utils.toWei("1", "ether"))
    });
});

