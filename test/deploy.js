const chai = require('chai');

const server = require('./server');
const util = require('./util');

const expect = chai.expect;

describe('deploy', () => {
    let creator;
    let addresses;
    let web3;

    before(async () => {
        let result = await server.setUp();
        web3 = result.web3;
        creator = result.addresses[0].toLowerCase();
        addresses = result.addresses;
    });

    after(async () => {
        await server.tearDown();
    });

    it('can be deployed with multiple admins', async () => {
        let admins = [addresses[1].toLowerCase(), addresses[2].toLowerCase()]
        let nonAdmin = addresses[3].toLowerCase();
        let PresalePool = await util.deployContract(
            web3,
            "PresalePool",
            creator,
            util.createPoolArgs({
                admins: admins,
                minContribution: 0,
                maxContribution: web3.utils.toWei("50", "ether"),
                maxPoolBalance: web3.utils.toWei("50", "ether"),
            })
        );
        let poolBalance = await web3.eth.getBalance(
            PresalePool.options.address
        );

        await util.methodWithGas(PresalePool.methods.setContributionSettings(0, 0, 0, []), creator);
        await util.methodWithGas(PresalePool.methods.setContributionSettings(0, 0, 0, []), admins[0]);
        await util.methodWithGas(PresalePool.methods.setContributionSettings(0, 0, 0, []), admins[1]);

        await util.expectVMException(
            util.methodWithGas(PresalePool.methods.setContributionSettings(0, 0, 0, []), nonAdmin)
        );
    });

    it('can be deployed with whitelisting enabled', async () => {
        let admins = [addresses[1], addresses[2]];
        let buyer1 = addresses[3];
        let PresalePool = await util.deployContract(
            web3,
            "PresalePool",
            creator,
            util.createPoolArgs({
                admins: admins,
                restricted: true,
                minContribution: 0,
                maxContribution: web3.utils.toWei("50", "ether"),
                maxPoolBalance: web3.utils.toWei("50", "ether"),
            })
        );

        await util.expectVMException(
            util.methodWithGas(
                PresalePool.methods.deposit(),
                buyer1,
                web3.utils.toWei("3", "ether")
            )
        );

        admins.push(creator);
        for (let i = 0; i < admins.length; i++) {
            await util.methodWithGas(
                PresalePool.methods.deposit(),
                admins[i],
                web3.utils.toWei("3", "ether")
            );
        }
    });

    it('can be deployed without balance', async () => {
        let PresalePool = await util.deployContract(
            web3,
            "PresalePool",
            creator,
            util.createPoolArgs({
                minContribution: 0,
                maxContribution: web3.utils.toWei("50", "ether"),
                maxPoolBalance: web3.utils.toWei("50", "ether"),
            })
        );
        let poolBalance = await web3.eth.getBalance(
            PresalePool.options.address
        );
        expect(poolBalance).to.equal(web3.utils.toWei("0", "ether"));
        expect(await util.getBalances(PresalePool)).to.deep.equal({});
    });

    it('can be deployed with balance', async () => {
        let PresalePool = await util.deployContract(
            web3, "PresalePool",
            creator,
            util.createPoolArgs({
                minContribution: 0,
                maxContribution: web3.utils.toWei("50", "ether"),
                maxPoolBalance: web3.utils.toWei("50", "ether"),
            }),
            web3.utils.toWei("5", "ether")
        );

        let expectedBalances = {}
        expectedBalances[creator] = {
            remaining: web3.utils.toWei("0", "ether"),
            contribution: web3.utils.toWei("5", "ether")
        }
        await util.verifyState(web3, PresalePool, expectedBalances, web3.utils.toWei("5", "ether"));
    });

    it('validates contribution settings during deploy', async () => {
        await util.expectVMException(
            util.deployContract(
                web3,
                "PresalePool",
                creator,
                util.createPoolArgs({
                    minContribution: 3,
                    maxContribution: 2,
                    maxPoolBalance: 5
                })
            )
        );
        await util.expectVMException(
            util.deployContract(
                web3,
                "PresalePool",
                creator,
                util.createPoolArgs({
                    minContribution: 3,
                    maxContribution: 0,
                    maxPoolBalance: 5
                })
            )
        );
        await util.expectVMException(
            util.deployContract(
                web3, "PresalePool",
                creator,
                util.createPoolArgs({
                    minContribution: 0,
                    maxContribution: 2,
                    maxPoolBalance: 1
                })
            )
        );
        await util.expectVMException(
            util.deployContract(
                web3, "PresalePool",
                creator,
                util.createPoolArgs({
                    minContribution: 3,
                    maxPoolBalance: 2,
                    maxContribution: 4
                })
            )
        );
    });
});

