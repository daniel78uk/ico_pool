const chai = require('chai');

const server = require('./server');
const util = require('./util');

const expect = chai.expect;
const BN = require('bn.js');


describe('setContributionSettings()', () => {
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

    it('limits cant exceed 1 billion eth', async () => {
        let billionEth = web3.utils.toWei((10**9).toString(), "ether");
        let moreThanBillionEth = web3.utils.toWei((1 + 10**9).toString(), "ether");

        await util.methodWithGas(
            PresalePool.methods.setContributionSettings(billionEth, billionEth, billionEth, []),
            creator
        );

        await util.expectVMException(
            util.methodWithGas(
                PresalePool.methods.setContributionSettings(0, billionEth, moreThanBillionEth, []),
                creator
            )
        );
        await util.expectVMException(
            util.methodWithGas(
                PresalePool.methods.setContributionSettings(0, moreThanBillionEth, moreThanBillionEth, []),
                creator
            )
        );
        await util.expectVMException(
            util.methodWithGas(
                PresalePool.methods.setContributionSettings(moreThanBillionEth, moreThanBillionEth, moreThanBillionEth, []),
                creator
            )
        );
    });

    it('validates limits', async () => {
        // the call below succeeds if and only if minContribution <=  maxContribution <= maxPoolBalance
        // PresalePool.methods.setContributionSettings(minContribution, maxContribution, maxPoolBalance, [])
        await util.expectVMException(
            util.methodWithGas(
                PresalePool.methods.setContributionSettings(3, 2, 5, []),
                creator
            )
        );
        // maxPoolBalance must exceed maxContribution
        await util.expectVMException(
            util.methodWithGas(
                PresalePool.methods.setContributionSettings(0, 2, 1, []),
                creator
            )
        );
        // maxPoolBalance must exceed minContribution
        await util.expectVMException(
            util.methodWithGas(
                PresalePool.methods.setContributionSettings(2, 2, 1, []),
                creator
            )
        );
        await util.expectVMException(
            util.methodWithGas(
                PresalePool.methods.setContributionSettings(3, 2, 1, []),
                creator
            )
        );

        await util.methodWithGas(
            PresalePool.methods.setContributionSettings(0, 2, 3, []),
            creator
        );
        await util.methodWithGas(
            PresalePool.methods.setContributionSettings(1, 2, 3, []),
            creator
        );
        await util.methodWithGas(
            PresalePool.methods.setContributionSettings(0, 2, 2, []),
            creator
        );
        await util.methodWithGas(
            PresalePool.methods.setContributionSettings(0, 0, 3, []),
            creator
        );
        await util.methodWithGas(
            PresalePool.methods.setContributionSettings(0, 0, 0, []),
            creator
        );
    });

    it('rebalances on increases to maxContribution', async () => {
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

        await util.methodWithGas(
            PresalePool.methods.setContributionSettings(
                0,
                web3.utils.toWei("2", "ether"),
                web3.utils.toWei("50", "ether"),
                [buyer1, buyer2]
            ),
            creator
        )
        await util.verifyState(web3, PresalePool, expectedBalances, web3.utils.toWei("8", "ether"));

        await util.methodWithGas(
            PresalePool.methods.setContributionSettings(
                0,
                web3.utils.toWei("3", "ether"),
                web3.utils.toWei("50", "ether"),
                []
            ),
            creator
        )
        await util.verifyState(web3, PresalePool, expectedBalances, web3.utils.toWei("8", "ether"));

        await util.methodWithGas(
            PresalePool.methods.setContributionSettings(
                0,
                web3.utils.toWei("3", "ether"),
                web3.utils.toWei("50", "ether"),
                [buyer1, buyer2]
            ),
            creator
        )
        expectedBalances[buyer1] = {
            remaining: web3.utils.toWei("2", "ether"),
            contribution: web3.utils.toWei("3", "ether")
        }
        expectedBalances[buyer2] = {
            remaining: web3.utils.toWei("0", "ether"),
            contribution: web3.utils.toWei("3", "ether")
        }
        await util.verifyState(web3, PresalePool, expectedBalances, web3.utils.toWei("8", "ether"));

        await util.methodWithGas(
            PresalePool.methods.setContributionSettings(
                0,
                web3.utils.toWei("3", "ether"),
                web3.utils.toWei("50", "ether"),
                []
            ),
            creator
        )
        await util.verifyState(web3, PresalePool, expectedBalances, web3.utils.toWei("8", "ether"));

        await util.methodWithGas(
            PresalePool.methods.setContributionSettings(
                0,
                web3.utils.toWei("3", "ether"),
                web3.utils.toWei("50", "ether"),
                [buyer1, buyer2]
            ),
            creator
        )
        await util.verifyState(web3, PresalePool, expectedBalances, web3.utils.toWei("8", "ether"));
    });


    it('rebalances on increases to maxPoolBalance', async () => {
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

        await util.methodWithGas(
            PresalePool.methods.setContributionSettings(
                0,
                web3.utils.toWei("2", "ether"),
                web3.utils.toWei("2", "ether"),
                [buyer1, buyer2]
            ),
            creator
        )
        await util.verifyState(web3, PresalePool, expectedBalances, web3.utils.toWei("8", "ether"));

        await util.methodWithGas(
            PresalePool.methods.setContributionSettings(
                0,
                web3.utils.toWei("6", "ether"),
                web3.utils.toWei("6", "ether"),
                []
            ),
            creator
        )
        await util.verifyState(web3, PresalePool, expectedBalances, web3.utils.toWei("8", "ether"));

        await util.methodWithGas(
            PresalePool.methods.setContributionSettings(
                0,
                web3.utils.toWei("6", "ether"),
                web3.utils.toWei("6", "ether"),
                [buyer1, buyer2]
            ),
            creator
        )
        expectedBalances[buyer1] = {
            remaining: web3.utils.toWei("0", "ether"),
            contribution: web3.utils.toWei("5", "ether")
        }
        expectedBalances[buyer2] = {
            remaining: web3.utils.toWei("2", "ether"),
            contribution: web3.utils.toWei("1", "ether")
        }
        await util.verifyState(web3, PresalePool, expectedBalances, web3.utils.toWei("8", "ether"));

        await util.methodWithGas(
            PresalePool.methods.setContributionSettings(
                0,
                web3.utils.toWei("6", "ether"),
                web3.utils.toWei("6", "ether"),
                []
            ),
            creator
        )
        await util.verifyState(web3, PresalePool, expectedBalances, web3.utils.toWei("8", "ether"));

        await util.methodWithGas(
            PresalePool.methods.setContributionSettings(
                0,
                web3.utils.toWei("6", "ether"),
                web3.utils.toWei("6", "ether"),
                [buyer1, buyer2]
            ),
            creator
        )
        await util.verifyState(web3, PresalePool, expectedBalances, web3.utils.toWei("8", "ether"));
    });

    it('rebalances on increases to both maxContribution and maxPoolBalance', async () => {
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
                web3.utils.toWei("1", "ether"),
                web3.utils.toWei("2", "ether"),
                []
            ),
            creator
        )
        expectedBalances[buyer1] = {
            remaining: web3.utils.toWei("4", "ether"),
            contribution: web3.utils.toWei("1", "ether")
        }
        expectedBalances[buyer2] = {
            remaining: web3.utils.toWei("2", "ether"),
            contribution: web3.utils.toWei("1", "ether")
        }
        await util.verifyState(web3, PresalePool, expectedBalances, web3.utils.toWei("8", "ether"));

        await util.methodWithGas(
            PresalePool.methods.setContributionSettings(
                0,
                web3.utils.toWei("1", "ether"),
                web3.utils.toWei("2", "ether"),
                [buyer1, buyer2]
            ),
            creator
        )
        await util.verifyState(web3, PresalePool, expectedBalances, web3.utils.toWei("8", "ether"));

        await util.methodWithGas(
            PresalePool.methods.setContributionSettings(
                0,
                web3.utils.toWei("1", "ether"),
                web3.utils.toWei("2", "ether"),
                []
            ),
            creator
        )
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
        await util.verifyState(web3, PresalePool, expectedBalances, web3.utils.toWei("8", "ether"));

        await util.methodWithGas(
            PresalePool.methods.setContributionSettings(
                0,
                web3.utils.toWei("2", "ether"),
                web3.utils.toWei("2", "ether"),
                [buyer1, buyer2]
            ),
            creator
        )
        await util.verifyState(web3, PresalePool, expectedBalances, web3.utils.toWei("8", "ether"));

        await util.methodWithGas(
            PresalePool.methods.setContributionSettings(
                0,
                web3.utils.toWei("5", "ether"),
                web3.utils.toWei("6", "ether"),
                []
            ),
            creator
        );
        await util.verifyState(web3, PresalePool, expectedBalances, web3.utils.toWei("8", "ether"));

        expectedBalances[buyer1] = {
            remaining: web3.utils.toWei("0", "ether"),
            contribution: web3.utils.toWei("5", "ether")
        }
        expectedBalances[buyer2] = {
            remaining: web3.utils.toWei("2", "ether"),
            contribution: web3.utils.toWei("1", "ether")
        }
        await util.methodWithGas(
            PresalePool.methods.setContributionSettings(
                0,
                web3.utils.toWei("5", "ether"),
                web3.utils.toWei("6", "ether"),
                [buyer1, buyer2]
            ),
            creator
        );
        await util.verifyState(web3, PresalePool, expectedBalances, web3.utils.toWei("8", "ether"));
        await util.methodWithGas(
            PresalePool.methods.setContributionSettings(
                0,
                web3.utils.toWei("5", "ether"),
                web3.utils.toWei("6", "ether"),
                []
            ),
            creator
        );
        await util.verifyState(web3, PresalePool, expectedBalances, web3.utils.toWei("8", "ether"));
        await util.methodWithGas(
            PresalePool.methods.setContributionSettings(
                0,
                web3.utils.toWei("5", "ether"),
                web3.utils.toWei("6", "ether"),
                [buyer1, buyer2]
            ),
            creator
        );
        await util.verifyState(web3, PresalePool, expectedBalances, web3.utils.toWei("8", "ether"));

        expectedBalances[buyer1] = {
            remaining: web3.utils.toWei("0", "ether"),
            contribution: web3.utils.toWei("5", "ether")
        }
        expectedBalances[buyer2] = {
            remaining: web3.utils.toWei("1", "ether"),
            contribution: web3.utils.toWei("2", "ether")
        }
        await util.methodWithGas(
            PresalePool.methods.setContributionSettings(
                0,
                web3.utils.toWei("5", "ether"),
                web3.utils.toWei("7", "ether"),
                [buyer1, buyer2]
            ),
            creator
        );
        await util.verifyState(web3, PresalePool, expectedBalances, web3.utils.toWei("8", "ether"));
    });


    it('rebalances on decreases to minContribution', async () => {
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
                web3.utils.toWei("4", "ether"),
                web3.utils.toWei("50", "ether"),
                web3.utils.toWei("50", "ether"),
                []
            ),
            creator
        )
        expectedBalances[buyer2] = {
            remaining: web3.utils.toWei("3", "ether"),
            contribution: web3.utils.toWei("0", "ether")
        }
        await util.verifyState(web3, PresalePool, expectedBalances, web3.utils.toWei("8", "ether"));


        await util.methodWithGas(
            PresalePool.methods.setContributionSettings(
                0,
                web3.utils.toWei("50", "ether"),
                web3.utils.toWei("50", "ether"),
                []
            ),
            creator
        )
        await util.verifyState(web3, PresalePool, expectedBalances, web3.utils.toWei("8", "ether"));

        await util.methodWithGas(
            PresalePool.methods.setContributionSettings(
                0,
                web3.utils.toWei("50", "ether"),
                web3.utils.toWei("50", "ether"),
                [buyer1, buyer2]
            ),
            creator
        )
        expectedBalances[buyer2] = {
            remaining: web3.utils.toWei("0", "ether"),
            contribution: web3.utils.toWei("3", "ether")
        }
        await util.verifyState(web3, PresalePool, expectedBalances, web3.utils.toWei("8", "ether"));

        await util.methodWithGas(
            PresalePool.methods.setContributionSettings(
                0,
                web3.utils.toWei("50", "ether"),
                web3.utils.toWei("50", "ether"),
                []
            ),
            creator
        )
        await util.verifyState(web3, PresalePool, expectedBalances, web3.utils.toWei("8", "ether"));
        await util.methodWithGas(
            PresalePool.methods.setContributionSettings(
                0,
                web3.utils.toWei("50", "ether"),
                web3.utils.toWei("50", "ether"),
                [buyer1, buyer2]
            ),
            creator
        )
        await util.verifyState(web3, PresalePool, expectedBalances, web3.utils.toWei("8", "ether"));
    });

    it('rebalance operation ignores blacklisted participants', async () => {
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
            PresalePool.methods.modifyWhitelist([], [buyer2]),
            creator
        );
        expectedBalances[buyer2] = {
            remaining: web3.utils.toWei("3", "ether"),
            contribution: web3.utils.toWei("0", "ether")
        }
        await util.verifyState(web3, PresalePool, expectedBalances, web3.utils.toWei("8", "ether"));

        await util.methodWithGas(
            PresalePool.methods.setContributionSettings(
                web3.utils.toWei("0", "ether"),
                web3.utils.toWei("100", "ether"),
                web3.utils.toWei("100", "ether"),
                [buyer1, buyer2]
            ),
            creator
        );
        await util.verifyState(web3, PresalePool, expectedBalances, web3.utils.toWei("8", "ether"));
        await util.methodWithGas(
            PresalePool.methods.setContributionSettings(
                web3.utils.toWei("0", "ether"),
                web3.utils.toWei("100", "ether"),
                web3.utils.toWei("100", "ether"),
                []
            ),
            creator
        );
        await util.verifyState(web3, PresalePool, expectedBalances, web3.utils.toWei("8", "ether"));
    });


    it('deposit respects contribution settings', async () => {
        await util.methodWithGas(
            PresalePool.methods.setContributionSettings(
                web3.utils.toWei("1", "ether"),
                web3.utils.toWei("5", "ether"),
                web3.utils.toWei("10", "ether"),
                []
            ),
            creator
        )
        await util.expectVMException(
            util.methodWithGas(
                PresalePool.methods.deposit(),
                buyer1,
                web3.utils.toWei("0.5", "ether")
            )
        );
        await util.expectVMException(
            util.methodWithGas(
                PresalePool.methods.deposit(),
                buyer1,
                web3.utils.toWei("6", "ether")
            )
        );
        await util.methodWithGas(
            PresalePool.methods.deposit(),
            buyer1,
            web3.utils.toWei("4", "ether")
        );
        await util.expectVMException(
            util.methodWithGas(
                PresalePool.methods.deposit(),
                buyer2,
                web3.utils.toWei("6", "ether")
            )
        );
        await util.methodWithGas(
            PresalePool.methods.deposit(),
            buyer2,
            web3.utils.toWei("5", "ether")
        );

        let expectedBalances = {}
        expectedBalances[buyer1] = {
            remaining: web3.utils.toWei("0", "ether"),
            contribution: web3.utils.toWei("4", "ether")
        }
        expectedBalances[buyer2] = {
            remaining: web3.utils.toWei("0", "ether"),
            contribution: web3.utils.toWei("5", "ether")
        }
        await util.verifyState(web3, PresalePool, expectedBalances, web3.utils.toWei("9", "ether"));

        await util.expectVMException(
            util.methodWithGas(
                PresalePool.methods.deposit(),
                buyer1,
                web3.utils.toWei("1.5", "ether")
            )
        );

        await util.methodWithGas(
            PresalePool.methods.deposit(),
            buyer1,
            web3.utils.toWei("1", "ether")
        );
        expectedBalances[buyer1].contribution = web3.utils.toWei("5", "ether")
        await util.verifyState(web3, PresalePool, expectedBalances, web3.utils.toWei("10", "ether"));
    });

});
