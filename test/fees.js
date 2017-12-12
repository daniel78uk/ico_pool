const chai = require('chai');

const server = require('./server');
const util = require('./util');

const expect = chai.expect;

describe('fees', () => {
    let creator;
    let addresses;
    let web3;
    let team;

    before(async () => {
        let result = await server.setUp();
        web3 = result.web3;
        creator = result.addresses[0].toLowerCase();
        team = [result.addresses[1].toLowerCase()];
        addresses = result.addresses;
    });

    after(async () => {
        await server.tearDown();
    });

    it('fees must be less than 50%', async () => {
        let PBFeeManager = await util.deployContract(
            web3,
            "PBFeeManager",
            creator,
            [[addresses[1].toLowerCase()]]
        );

        await util.deployContract(
            web3,
            "PresalePool",
            creator,
            util.createPoolArgs({
                feesPerEther: web3.utils.toWei("0.49", "ether"),
                feeManager: PBFeeManager.options.address,
                maxContribution: web3.utils.toWei("50", "ether"),
                maxPoolBalance: web3.utils.toWei("50", "ether")
            })
        );

        await util.expectVMException(
            util.deployContract(
                web3,
                "PresalePool",
                creator,
                util.createPoolArgs({
                    feesPerEther: web3.utils.toWei("0.5", "ether"),
                    feeManager: PBFeeManager.options.address,
                    maxContribution: web3.utils.toWei("50", "ether"),
                    maxPoolBalance: web3.utils.toWei("50", "ether")
                })
            )
        );
    });

    it('feeManager must be valid', async () => {
        await util.expectVMException(
            util.deployContract(
                web3,
                "PresalePool",
                creator,
                util.createPoolArgs({
                    feesPerEther: web3.utils.toWei("0.49", "ether"),
                    feeManager: addresses[1].toLowerCase(),
                    maxContribution: web3.utils.toWei("50", "ether"),
                    maxPoolBalance: web3.utils.toWei("50", "ether")
                })
            )
        );
    });

    it('cannot transferFees in open state or failed state', async () => {
        let FeeManager = await util.deployContract(
            web3,
            "PBFeeManager",
            creator,
            [team]
        );
        let PresalePool = await util.deployContract(
            web3,
            "PresalePool",
            creator,
            util.createPoolArgs({
                feesPerEther: web3.utils.toWei("0.2", "ether"),
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

        await util.expectVMException(
            util.methodWithGas(
                PresalePool.methods.transferFees(),
                creator
            )
        );
        await util.expectVMException(
            util.methodWithGas(
                PresalePool.methods.transferAndDistributeFees(),
                creator
            )
        );

        await util.methodWithGas(
            PresalePool.methods.fail(),
            creator
        );

        await util.expectVMException(
            util.methodWithGas(
                PresalePool.methods.transferFees(),
                creator
            )
        );
        await util.expectVMException(
            util.methodWithGas(
                PresalePool.methods.transferAndDistributeFees(),
                creator
            )
        );
    });

    it('cannot transferFees unless tokens have been claimed', async () => {
        let FeeManager = await util.deployContract(
            web3,
            "PBFeeManager",
            creator,
            [team]
        );
        let PresalePool = await util.deployContract(
            web3,
            "PresalePool",
            creator,
            util.createPoolArgs({
                feesPerEther: web3.utils.toWei("0.2", "ether"),
                feeManager: FeeManager.options.address,
                maxContribution: web3.utils.toWei("50", "ether"),
                maxPoolBalance: web3.utils.toWei("50", "ether")
            })
        );
        let blacklisted = addresses[2];
        let TestToken = await util.deployContract(
            web3,
            "TestToken",
            creator,
            [blacklisted]
        );
        await util.methodWithGas(
            PresalePool.methods.setToken(TestToken.options.address, true),
            creator
        );

        await util.methodWithGas(
            PresalePool.methods.deposit(),
            creator,
            web3.utils.toWei("2", "ether")
        );
        await util.methodWithGas(
            PresalePool.methods.deposit(),
            blacklisted,
            web3.utils.toWei("3", "ether")
        );
        await util.methodWithGas(
            PresalePool.methods.payToPresale(TestToken.options.address, 0),
            creator
        );

        await util.expectVMException(
            util.methodWithGas(
                PresalePool.methods.transferFees(),
                creator
            )
        );
        await util.expectVMException(
            util.methodWithGas(
                PresalePool.methods.transferAndDistributeFees(),
                creator
            )
        );

        let nonContributor = addresses[3];
        await util.methodWithGas(
            PresalePool.methods.transferTokensTo([nonContributor]),
            nonContributor
        );

        await util.expectVMException(
            util.methodWithGas(
                PresalePool.methods.transferFees(),
                creator
            )
        );
        await util.expectVMException(
            util.methodWithGas(
                PresalePool.methods.transferAndDistributeFees(),
                creator
            )
        );

        await util.methodWithGas(
            PresalePool.methods.transferTokensTo([blacklisted]),
            blacklisted
        );

        await util.expectVMException(
            util.methodWithGas(
                PresalePool.methods.transferFees(),
                creator
            )
        );

        await util.expectVMException(
            util.methodWithGas(
                PresalePool.methods.transferAndDistributeFees(),
                creator
            )
        );
    });

    it('cannot transferFees in refund state', async () => {
        let FeeManager = await util.deployContract(
            web3,
            "PBFeeManager",
            creator,
            [team]
        );
        let PresalePool = await util.deployContract(
            web3,
            "PresalePool",
            creator,
            util.createPoolArgs({
                feesPerEther: web3.utils.toWei("0.2", "ether"),
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
        let payoutAddress = addresses[5];
        await util.methodWithGas(
            PresalePool.methods.payToPresale(payoutAddress, 0),
            creator
        );
        await util.methodWithGas(
            PresalePool.methods.expectRefund(payoutAddress),
            creator
        );
        web3.eth.sendTransaction({
            from: payoutAddress,
            to: PresalePool.options.address,
            value: web3.utils.toWei("101", "ether")
        });

        await util.expectVMException(
            util.methodWithGas(
                PresalePool.methods.transferFees(),
                creator
            )
        );
        await util.expectVMException(
            util.methodWithGas(
                PresalePool.methods.transferAndDistributeFees(),
                creator
            )
        );
    });

    it('transferFees succeeds after tokens have been claimed', async () => {
        let FeeManager = await util.deployContract(
            web3,
            "PBFeeManager",
            creator,
            [team]
        );
        let PresalePool = await util.deployContract(
            web3,
            "PresalePool",
            creator,
            util.createPoolArgs({
                feesPerEther: web3.utils.toWei("0.02", "ether"),
                feeManager: FeeManager.options.address,
                maxContribution: web3.utils.toWei("50", "ether"),
                maxPoolBalance: web3.utils.toWei("50", "ether")
            })
        );
        let TestToken = await util.deployContract(
            web3,
            "TestToken",
            creator,
            [addresses[2]]
        );
        await util.methodWithGas(
            PresalePool.methods.setToken(TestToken.options.address, true),
            creator
        );

        await util.methodWithGas(
            PresalePool.methods.deposit(),
            creator,
            web3.utils.toWei("2", "ether")
        );
        await util.methodWithGas(
            PresalePool.methods.payToPresale(TestToken.options.address, 0),
            creator
        );

        await util.methodWithGas(
            PresalePool.methods.transferTokensTo([creator]),
            creator
        );

        let expectedPayout = web3.utils.toWei((2*.02).toString(), "ether");
        let beforeBalance = await web3.eth.getBalance(FeeManager.options.address);

        await util.methodWithGas(
            PresalePool.methods.transferFees(),
            creator
        );

        let afterBalance = await web3.eth.getBalance(FeeManager.options.address);
        let difference = parseInt(afterBalance) - parseInt(beforeBalance);
        expect(difference / expectedPayout).to.be.within(.98, 1.0);

        await util.expectVMException(
            util.methodWithGas(
                PresalePool.methods.transferFees(),
                creator
            )
        );
        await util.expectVMException(
            util.methodWithGas(
                PresalePool.methods.transferAndDistributeFees(),
                creator
            )
        );
    });

    it('transferAndDistributeFees succeeds after tokens have been claimed', async () => {
        let FeeManager = await util.deployContract(
            web3,
            "PBFeeManager",
            creator,
            [team]
        );
        let PresalePool = await util.deployContract(
            web3,
            "PresalePool",
            creator,
            util.createPoolArgs({
                feesPerEther: web3.utils.toWei("0.02", "ether"),
                feeManager: FeeManager.options.address,
                maxContribution: web3.utils.toWei("50", "ether"),
                maxPoolBalance: web3.utils.toWei("50", "ether")
            })
        );
        let TestToken = await util.deployContract(
            web3,
            "TestToken",
            creator,
            [addresses[2]]
        );
        await util.methodWithGas(
            PresalePool.methods.setToken(TestToken.options.address, true),
            creator
        );

        let buyer1 = addresses[3];
        await util.methodWithGas(
            PresalePool.methods.deposit(),
            creator,
            web3.utils.toWei("4", "ether")
        );
        await util.methodWithGas(
            PresalePool.methods.deposit(),
            buyer1,
            web3.utils.toWei("2", "ether")
        );
        await util.methodWithGas(
            PresalePool.methods.payToPresale(TestToken.options.address, 0),
            creator
        );

        await util.methodWithGas(
            PresalePool.methods.transferTokensTo([buyer1]),
            buyer1
        );

        let expectedPayout = web3.utils.toWei((6*0.01).toString(), "ether");
        let beforeBalance = await web3.eth.getBalance(creator);

        await util.methodWithGas(
            PresalePool.methods.transferAndDistributeFees(),
            buyer1
        );

        let afterBalance = await web3.eth.getBalance(creator);
        let difference = parseInt(afterBalance) - parseInt(beforeBalance);
        expect(difference / expectedPayout).to.be.within(.98, 1.0);

        await util.methodWithGas(PresalePool.methods.transferAllTokens(), creator);
        expect(await TestToken.methods.balanceOf(creator).call())
        .to.equal("40");
        expect(await TestToken.methods.balanceOf(buyer1).call())
        .to.equal("20");
    });

});
