const chai = require('chai');

const server = require('./server');
const util = require('./util');

const expect = chai.expect;

describe('whitelist', () => {
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
        buyer3 = result.addresses[3].toLowerCase();
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

    it('can add addresses not already in pool to whitelist', async () => {
        // can only be modified by creator
        await util.expectVMException(
            util.methodWithGas(
                PresalePool.methods.modifyWhitelist([buyer1], []),
                buyer1
            )
        );

        await util.methodWithGas(
            PresalePool.methods.modifyWhitelist([buyer1], [buyer3]),
            creator
        );

        await util.methodWithGas(
            PresalePool.methods.deposit(),
            buyer1,
            web3.utils.toWei("5", "ether")
        );

        await util.expectVMException(
            util.methodWithGas(
                PresalePool.methods.deposit(),
                buyer2,
                web3.utils.toWei("1", "ether")
            )
        );

        await util.expectVMException(
            util.methodWithGas(
                PresalePool.methods.deposit(),
                buyer3,
                web3.utils.toWei("1", "ether")
            )
        );

        let expectedBalances = {}
        expectedBalances[buyer1] = {
            remaining: web3.utils.toWei("0", "ether"),
            contribution: web3.utils.toWei("5", "ether"),
        }
        await util.verifyState(web3, PresalePool, expectedBalances, web3.utils.toWei("5", "ether"));
    });

    it('can backlist addresses who have contributions in the pool', async () => {
        await util.methodWithGas(
            PresalePool.methods.deposit(),
            buyer1,
            web3.utils.toWei("5", "ether")
        )

        await util.methodWithGas(
            PresalePool.methods.deposit(),
            buyer2,
            web3.utils.toWei("1", "ether")
        )

        let expectedBalances = {}
        expectedBalances[buyer1] = {
            remaining: web3.utils.toWei("0", "ether"),
            contribution: web3.utils.toWei("5", "ether"),
        }
        expectedBalances[buyer2] = {
            remaining: web3.utils.toWei("0", "ether"),
            contribution: web3.utils.toWei("1", "ether"),
        }
        await util.verifyState(web3, PresalePool, expectedBalances, web3.utils.toWei("6", "ether"));

        await util.methodWithGas(
            PresalePool.methods.modifyWhitelist([], [buyer2]),
            creator
        );
        expectedBalances[buyer2].whitelisted = false
        expectedBalances[buyer2].contribution = web3.utils.toWei("0", "ether")
        expectedBalances[buyer2].remaining = web3.utils.toWei("1", "ether")
        await util.verifyState(web3, PresalePool, expectedBalances, web3.utils.toWei("6", "ether"));

        await util.methodWithGas(
            PresalePool.methods.deposit(),
            buyer1,
            web3.utils.toWei("5", "ether")
        )
        await util.expectVMException(
            util.methodWithGas(
                PresalePool.methods.deposit(),
                buyer2,
                web3.utils.toWei("1", "ether")
            )
        );

        expectedBalances[buyer1].contribution = web3.utils.toWei("10", "ether");
        await util.verifyState(web3, PresalePool, expectedBalances, web3.utils.toWei("11", "ether"));

        // can only be called by creator
        await util.expectVMException(
            util.methodWithGas(
                PresalePool.methods.removeWhitelist(),
                buyer1
            )
        );

        await util.methodWithGas(
            PresalePool.methods.removeWhitelist(),
            creator
        );
        expectedBalances[buyer2].contribution = web3.utils.toWei("1", "ether")
        expectedBalances[buyer2].remaining = web3.utils.toWei("0", "ether")
        expectedBalances[buyer2].whitelisted = true;
        await util.verifyState(web3, PresalePool, expectedBalances, web3.utils.toWei("11", "ether"));

        await util.methodWithGas(
            PresalePool.methods.deposit(),
            buyer2,
            web3.utils.toWei("1", "ether")
        )
        await util.methodWithGas(
            PresalePool.methods.deposit(),
            buyer3,
            web3.utils.toWei("1", "ether")
        )
        expectedBalances[buyer2].contribution = web3.utils.toWei("2", "ether")
        expectedBalances[buyer3] = {
            contribution: web3.utils.toWei("1", "ether"),
            remaining: web3.utils.toWei("0", "ether"),
            whitelisted: true
        }
        await util.verifyState(web3, PresalePool, expectedBalances, web3.utils.toWei("13", "ether"));
    });

    it('blacklisted addresses cannot do partial refunds', async () => {
        await util.methodWithGas(
            PresalePool.methods.deposit(),
            buyer1,
            web3.utils.toWei("5", "ether")
        )

        let expectedBalances = {}
        expectedBalances[buyer1] = {
            remaining: web3.utils.toWei("0", "ether"),
            contribution: web3.utils.toWei("5", "ether"),
        }
        await util.verifyState(web3, PresalePool, expectedBalances, web3.utils.toWei("5", "ether"));

        await util.methodWithGas(
            PresalePool.methods.modifyWhitelist([], [buyer1]),
            creator
        );
        expectedBalances[buyer1].whitelisted = false
        expectedBalances[buyer1].contribution = web3.utils.toWei("0", "ether")
        expectedBalances[buyer1].remaining = web3.utils.toWei("5", "ether")
        await util.verifyState(web3, PresalePool, expectedBalances, web3.utils.toWei("5", "ether"));

        await util.expectVMException(
            util.methodWithGas(
                PresalePool.methods.withdraw(web3.utils.toWei("1", "ether")),
                buyer1
            )
        );
        await util.verifyState(web3, PresalePool, expectedBalances, web3.utils.toWei("5", "ether"));

        await util.methodWithGas(
            PresalePool.methods.withdrawAll(),
            buyer1
        )
        expectedBalances[buyer1].remaining = web3.utils.toWei("0", "ether")
        await util.verifyState(web3, PresalePool, expectedBalances, web3.utils.toWei("0", "ether"));
    });

    it('including addresses in the whitelist respects max contribution limit', async () => {
        await util.methodWithGas(
            PresalePool.methods.deposit(),
            buyer1,
            web3.utils.toWei("5", "ether")
        )
        await util.methodWithGas(
            PresalePool.methods.deposit(),
            buyer2,
            web3.utils.toWei("7", "ether")
        )

        let expectedBalances = {}
        expectedBalances[buyer1] = {
            remaining: web3.utils.toWei("0", "ether"),
            contribution: web3.utils.toWei("5", "ether"),
        }
        expectedBalances[buyer2] = {
            remaining: web3.utils.toWei("0", "ether"),
            contribution: web3.utils.toWei("7", "ether"),
        }
        await util.verifyState(web3, PresalePool, expectedBalances, web3.utils.toWei("12", "ether"));

        await util.methodWithGas(
            PresalePool.methods.modifyWhitelist([], [buyer2]),
            creator
        );
        expectedBalances[buyer2].whitelisted = false
        expectedBalances[buyer2].contribution = web3.utils.toWei("0", "ether")
        expectedBalances[buyer2].remaining = web3.utils.toWei("7", "ether")
        await util.verifyState(web3, PresalePool, expectedBalances, web3.utils.toWei("12", "ether"));

        await util.methodWithGas(
            PresalePool.methods.setContributionSettings(
                0,
                web3.utils.toWei("5", "ether"),
                web3.utils.toWei("50", "ether"),
                []
            ),
            creator
        );
        await util.verifyState(web3, PresalePool, expectedBalances, web3.utils.toWei("12", "ether"));

        await util.methodWithGas(
            PresalePool.methods.modifyWhitelist([buyer2], []),
            creator
        );
        expectedBalances[buyer2].contribution = web3.utils.toWei("5", "ether")
        expectedBalances[buyer2].remaining = web3.utils.toWei("2", "ether")
        expectedBalances[buyer2].whitelisted = true;
        await util.verifyState(web3, PresalePool, expectedBalances, web3.utils.toWei("12", "ether"));

        await util.expectVMException(
            util.methodWithGas(
                PresalePool.methods.deposit(),
                buyer2,
                web3.utils.toWei("1", "ether")
            )
        );
        await util.expectVMException(
            util.methodWithGas(
                PresalePool.methods.deposit(),
                buyer3,
                web3.utils.toWei("1", "ether")
            )
        );
    });

    it('including addresses in the whitelist respects max pool balance limit', async () => {
        await util.methodWithGas(
            PresalePool.methods.deposit(),
            buyer1,
            web3.utils.toWei("5", "ether")
        )
        await util.methodWithGas(
            PresalePool.methods.deposit(),
            buyer2,
            web3.utils.toWei("7", "ether")
        )

        let expectedBalances = {}
        expectedBalances[buyer1] = {
            remaining: web3.utils.toWei("0", "ether"),
            contribution: web3.utils.toWei("5", "ether"),
        }
        expectedBalances[buyer2] = {
            remaining: web3.utils.toWei("0", "ether"),
            contribution: web3.utils.toWei("7", "ether"),
        }
        await util.verifyState(web3, PresalePool, expectedBalances, web3.utils.toWei("12", "ether"));

        await util.methodWithGas(
            PresalePool.methods.modifyWhitelist([], [buyer2]),
            creator
        );
        expectedBalances[buyer2].whitelisted = false
        expectedBalances[buyer2].contribution = web3.utils.toWei("0", "ether")
        expectedBalances[buyer2].remaining = web3.utils.toWei("7", "ether")
        await util.verifyState(web3, PresalePool, expectedBalances, web3.utils.toWei("12", "ether"));

        await util.methodWithGas(
            PresalePool.methods.setContributionSettings(
                0,
                web3.utils.toWei("6", "ether"),
                web3.utils.toWei("6", "ether"),
                []
            ),
            creator
        );
        await util.verifyState(web3, PresalePool, expectedBalances, web3.utils.toWei("12", "ether"));

        await util.methodWithGas(
            PresalePool.methods.modifyWhitelist([buyer2], []),
            creator
        );
        expectedBalances[buyer2].contribution = web3.utils.toWei("1", "ether")
        expectedBalances[buyer2].remaining = web3.utils.toWei("6", "ether")
        expectedBalances[buyer2].whitelisted = true;
        await util.verifyState(web3, PresalePool, expectedBalances, web3.utils.toWei("12", "ether"));

        await util.expectVMException(
            util.methodWithGas(
                PresalePool.methods.deposit(),
                buyer2,
                web3.utils.toWei("1", "ether")
            )
        );
    });

    it('including addresses in the whitelist respects min contribution threshold', async () => {
        await util.methodWithGas(
            PresalePool.methods.deposit(),
            buyer1,
            web3.utils.toWei("5", "ether")
        )
        await util.methodWithGas(
            PresalePool.methods.deposit(),
            buyer2,
            web3.utils.toWei("3", "ether")
        )

        let expectedBalances = {}
        expectedBalances[buyer1] = {
            remaining: web3.utils.toWei("0", "ether"),
            contribution: web3.utils.toWei("5", "ether"),
        }
        expectedBalances[buyer2] = {
            remaining: web3.utils.toWei("0", "ether"),
            contribution: web3.utils.toWei("3", "ether"),
        }
        await util.verifyState(web3, PresalePool, expectedBalances, web3.utils.toWei("8", "ether"));

        await util.methodWithGas(
            PresalePool.methods.modifyWhitelist([], [buyer2]),
            creator
        );
        expectedBalances[buyer2].whitelisted = false
        expectedBalances[buyer2].contribution = web3.utils.toWei("0", "ether")
        expectedBalances[buyer2].remaining = web3.utils.toWei("3", "ether")
        await util.verifyState(web3, PresalePool, expectedBalances, web3.utils.toWei("8", "ether"));

        await util.methodWithGas(
            PresalePool.methods.setContributionSettings(
                web3.utils.toWei("5", "ether"),
                web3.utils.toWei("50", "ether"),
                web3.utils.toWei("50", "ether"),
                []
            ),
            creator
        );
        await util.verifyState(web3, PresalePool, expectedBalances, web3.utils.toWei("8", "ether"));

        await util.methodWithGas(
            PresalePool.methods.modifyWhitelist([buyer2], []),
            creator
        );
        expectedBalances[buyer2].whitelisted = true;
        await util.verifyState(web3, PresalePool, expectedBalances, web3.utils.toWei("8", "ether"));

        await util.expectVMException(
            util.methodWithGas(
                PresalePool.methods.deposit(),
                buyer2,
                web3.utils.toWei("1", "ether")
            )
        );

        await util.methodWithGas(
            PresalePool.methods.deposit(),
            buyer2,
            web3.utils.toWei("2", "ether")
        )
        expectedBalances[buyer2].contribution = web3.utils.toWei("5", "ether")
        expectedBalances[buyer2].remaining = web3.utils.toWei("0", "ether")
        await util.verifyState(web3, PresalePool, expectedBalances, web3.utils.toWei("10", "ether"));
    });
});

