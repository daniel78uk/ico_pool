const chai = require('chai');

const server = require('./server');
const util = require('./util');

const expect = chai.expect;

describe('PBFeeManager', () => {
    let creator;
    let addresses;
    let web3;

    before(async () => {
        let result = await server.setUp();
        web3 = result.web3;
        creator = result.addresses[0].toLowerCase();
        addresses = result.addresses.map((s) => s.toLowerCase());
    });

    after(async () => {
        await server.tearDown();
    });

    function addressEquals(a, b) {
        expect(a.toLowerCase()).to.equal(b.toLowerCase());
    }

    async function payFees(options) {
        let {
            contractAddress,
            FeeManager,
            amount,
            expectedTeamPayout
        } = options;

        let expectedTotalRecipientsPayout = parseFloat(amount) - parseFloat(expectedTeamPayout);
        let beforeBalance = await FeeManager.methods.outstandingFeesBalance().call();

        await util.methodWithGas(
            FeeManager.methods.sendFees(),
            contractAddress,
            amount
        );

        let afterBalance = await FeeManager.methods.outstandingFeesBalance().call();
        let difference = parseInt(afterBalance) - parseInt(beforeBalance);
        expect(difference / expectedTotalRecipientsPayout).to.be.within(.98, 1.0);
    }

    async function claimMyFees(options) {
        let {
            contractAddress,
            recipients,
            FeeManager,
            expectedPayout
        } = options;

        for (let i = 0; i < recipients.length; i++ ) {
            let recipient = recipients[i];
            await util.expectBalanceChange(web3, recipient, expectedPayout, ()=> {
                return util.methodWithGas(
                    FeeManager.methods.claimMyFees(contractAddress),
                    recipient
                );
            });
        }
    }

    async function distributeFees(options) {
        let {
            contractAddress,
            recipients,
            FeeManager,
            expectedPayout
        } = options;

        await util.expectBalanceChangeAddresses(web3, recipients, expectedPayout, ()=>{
            return util.methodWithGas(
                FeeManager.methods.distributeFees(recipients),
                contractAddress
            );
        });
    }

    async function createFees(options) {
        let {
            team,
            contractAddress,
            recipients,
            feesPerEther,
            expectedRecipientShare,
        } = options;

        let FeeManager = await util.deployContract(
            web3,
            "PBFeeManager",
            creator,
            [team]
        );

        await util.methodWithGas(
            FeeManager.methods.create(
                feesPerEther,
                recipients
            ),
            contractAddress
        );

        let fees = await FeeManager.methods.getFees(contractAddress).call();
        let recipientNumerator = fees[0];
        let denominator = fees[1];
        let recipientShare = parseFloat(recipientNumerator) / parseInt(denominator);
        expect(recipientShare).to.be.closeTo(expectedRecipientShare, 0.001);

        return FeeManager;
    }

    async function claimMyTeamFees(options) {
        let {
            team,
            FeeManager,
            expectedPayout,
        } = options;

        for (let i = 0; i < team.length; i++ ) {
            let member = team[i];
            await util.expectBalanceChange(web3, member, expectedPayout, () => {
                return util.methodWithGas(
                    FeeManager.methods.claimMyTeamFees(),
                    member
                )
            });
        }
    }

    async function distributeTeamFees(options) {
        let {
            team,
            FeeManager,
            expectedPayout,
        } = options;

        await util.expectBalanceChangeAddresses(web3, team, expectedPayout, () =>{
            return util.methodWithGas(
                FeeManager.methods.distributeTeamFees(),
                team[0]
            );
        });
    }

    it('must have at least one team member address', async () => {
        await util.expectVMException(
            util.deployContract(
                web3,
                "PBFeeManager",
                creator,
                [[]]
            )
        );
    });

    it('handles duplicate team members', async () => {
        let team = [creator, creator, addresses[1], creator];
        let FeeManager = await util.deployContract(
            web3,
            "PBFeeManager",
            creator,
            [team]
        );

        addressEquals(await FeeManager.methods.teamMembers(0).call(), creator);
        addressEquals(await FeeManager.methods.teamMembers(1).call(), addresses[1]);
        await util.expectVMException(
            FeeManager.methods.teamMembers(2).call()
        );
    });

    it('feesPerEther must be less than 50%', async () => {
        let team = [creator];
        let FeeManager = await util.deployContract(
            web3,
            "PBFeeManager",
            creator,
            [team]
        );
        let recipients = [creator];

        await util.expectVMException(
            util.methodWithGas(
                FeeManager.methods.create(
                    web3.utils.toWei("0.5", "ether"),
                    recipients
                ),
                creator
            )
        );

        await util.expectVMException(
            util.methodWithGas(
                FeeManager.methods.create(
                    web3.utils.toWei("1.5", "ether"),
                    recipients
                ),
                creator
            )
        );

        await util.methodWithGas(
            FeeManager.methods.create(
                web3.utils.toWei("0.49", "ether"),
                recipients
            ),
            creator
        );
    });

    it('must have at least one fee recipient', async () => {
        let team = [creator];
        let FeeManager = await util.deployContract(
            web3,
            "PBFeeManager",
            creator,
            [team]
        );
        let recipients = [creator];

        await util.expectVMException(
            util.methodWithGas(
                FeeManager.methods.create(
                    web3.utils.toWei("0.1", "ether"),
                    []
                ),
                creator
            )
        );
    });

    it('must have less than 5 recipients', async () => {
        let team = [creator];
        let FeeManager = await util.deployContract(
            web3,
            "PBFeeManager",
            creator,
            [team]
        );

        let recipients = [
            addresses[0],
            addresses[1],
            addresses[2],
            addresses[3],
        ];
        await util.methodWithGas(
            FeeManager.methods.create(
                web3.utils.toWei("0.1", "ether"),
                recipients
            ),
            creator
        );

        recipients.push(addresses[4]);
        await util.expectVMException(
            util.methodWithGas(
                FeeManager.methods.create(
                    web3.utils.toWei("0.1", "ether"),
                    recipients
                ),
                creator
            )
        );
    });

    it('can only create fee structure once', async () => {
        let team = [creator];
        let FeeManager = await util.deployContract(
            web3,
            "PBFeeManager",
            creator,
            [team]
        );
        let recipients = [creator];

        await util.methodWithGas(
            FeeManager.methods.create(
                web3.utils.toWei("0.1", "ether"),
                recipients
            ),
            creator
        );

        await util.expectVMException(
            util.methodWithGas(
                FeeManager.methods.create(
                    web3.utils.toWei("0.1", "ether"),
                    recipients
                ),
                creator
            )
        );
    });

    it('cant include duplicate fee recipients', async () => {
        let team = [creator];
        let FeeManager = await util.deployContract(
            web3,
            "PBFeeManager",
            creator,
            [team]
        );
        let recipients = [creator, addresses[3], creator];

        await util.expectVMException(
            util.methodWithGas(
                FeeManager.methods.create(
                    web3.utils.toWei("0.1", "ether"),
                    recipients
                ),
                creator
            )
        );
    });

    it('splits fee to 50-50 when there is only one recipient - claim fees', async () => {
        let team = [creator];
        let contractAddress = addresses[1];
        let recipients = [addresses[2]];

        let FeeManager = await createFees({
            team: team,
            contractAddress: contractAddress,
            feesPerEther: web3.utils.toWei(".01", "ether"),
            recipients: recipients,
            expectedRecipientShare: 0.5,
        });

        await payFees({
            contractAddress: contractAddress,
            FeeManager: FeeManager,
            amount: web3.utils.toWei("2", "ether"),
            expectedTeamPayout: web3.utils.toWei("1", "ether")
        });

        await claimMyFees({
            recipients: recipients,
            FeeManager: FeeManager,
            contractAddress: contractAddress,
            expectedPayout: web3.utils.toWei("1", "ether")
        });

        await util.expectVMException(
            claimMyFees({
                recipients: recipients,
                FeeManager: FeeManager,
                contractAddress: contractAddress,
                expectedPayout: web3.utils.toWei("1", "ether")
            })
        );

        await distributeFees({
            recipients: recipients,
            FeeManager: FeeManager,
            contractAddress: contractAddress,
            expectedPayout: web3.utils.toWei("0", "ether")
        });
    });

    it('splits fee to 50-50 when there is only one recipient - distribute fees', async () => {
        let team = [creator];
        let contractAddress = addresses[1];
        let recipients = [addresses[2]];

        let FeeManager = await createFees({
            team: team,
            contractAddress: contractAddress,
            feesPerEther: web3.utils.toWei(".01", "ether"),
            recipients: recipients,
            expectedRecipientShare: 0.5,
        });

        await payFees({
            contractAddress: contractAddress,
            FeeManager: FeeManager,
            amount: web3.utils.toWei("2", "ether"),
            expectedTeamPayout: web3.utils.toWei("1", "ether")
        });

        await distributeFees({
            recipients: recipients,
            FeeManager: FeeManager,
            contractAddress: contractAddress,
            expectedPayout: web3.utils.toWei("1", "ether")
        });

        await util.expectVMException(
            claimMyFees({
                recipients: recipients,
                FeeManager: FeeManager,
                contractAddress: contractAddress,
                expectedPayout: web3.utils.toWei("1", "ether")
            })
        );

        await distributeFees({
            recipients: recipients,
            FeeManager: FeeManager,
            contractAddress: contractAddress,
            expectedPayout: web3.utils.toWei("0", "ether")
        });
    });

    it('caps team fee to 1% when there is 1 recipient', async () => {
        let team = [creator];
        let contractAddress = addresses[1];
        let recipients = [addresses[2]];

        let FeeManager = await createFees({
            team: team,
            contractAddress: contractAddress,
            feesPerEther: web3.utils.toWei(".1", "ether"),
            recipients: recipients,
            expectedRecipientShare: 0.9,
        });

        await payFees({
            contractAddress: contractAddress,
            FeeManager: FeeManager,
            amount: web3.utils.toWei("10", "ether"),
            expectedTeamPayout: web3.utils.toWei("1", "ether")
        });

        await claimMyFees({
            recipients: recipients,
            FeeManager: FeeManager,
            contractAddress: contractAddress,
            expectedPayout: web3.utils.toWei("9", "ether")
        });
    });

    it('recipients cant claim more than their share', async () => {
        let team = [creator];
        let contractAddress = addresses[1];
        let recipients = [addresses[2], addresses[3]];

        let FeeManager = await createFees({
            team: team,
            contractAddress: contractAddress,
            feesPerEther: web3.utils.toWei(".01", "ether"),
            recipients: recipients,
            expectedRecipientShare: 0.25,
        });

        await payFees({
            contractAddress: contractAddress,
            FeeManager: FeeManager,
            amount: web3.utils.toWei("10", "ether"),
            expectedTeamPayout: web3.utils.toWei("5", "ether")
        });

        for (let i = 0; i < recipients.length; i++) {
            await claimMyFees({
                recipients: [recipients[i]],
                FeeManager: FeeManager,
                contractAddress: contractAddress,
                expectedPayout: web3.utils.toWei("2.5", "ether")
            });

            await util.expectVMException(
                claimMyFees({
                    recipients: [recipients[i]],
                    FeeManager: FeeManager,
                    contractAddress: contractAddress,
                    expectedPayout: web3.utils.toWei("0", "ether")
                })
            );
        }
    });

    it('recipients cant claim more than their share via distribute fees', async () => {
        let team = [creator];
        let contractAddress = addresses[1];
        let recipients = [addresses[2], addresses[3]];

        let FeeManager = await createFees({
            team: team,
            contractAddress: contractAddress,
            feesPerEther: web3.utils.toWei(".01", "ether"),
            recipients: recipients,
            expectedRecipientShare: 0.25,
        });

        await payFees({
            contractAddress: contractAddress,
            FeeManager: FeeManager,
            amount: web3.utils.toWei("10", "ether"),
            expectedTeamPayout: web3.utils.toWei("5", "ether")
        });

        await distributeFees({
            recipients: recipients,
            FeeManager: FeeManager,
            contractAddress: contractAddress,
            expectedPayout: web3.utils.toWei("2.5", "ether")
        });

        await distributeFees({
            recipients: recipients,
            FeeManager: FeeManager,
            contractAddress: contractAddress,
            expectedPayout: 0
        });
    });

    it('caps team fee to 1% when there is more than 1 recipient', async () => {
        let team = [creator];
        let contractAddress = addresses[1];
        let recipients = [addresses[2], addresses[3]];

        let FeeManager = await createFees({
            team: team,
            contractAddress: contractAddress,
            feesPerEther: web3.utils.toWei(".1", "ether"),
            recipients: recipients,
            expectedRecipientShare: 0.45,
        });

        await payFees({
            contractAddress: contractAddress,
            FeeManager: FeeManager,
            amount: web3.utils.toWei("10", "ether"),
            expectedTeamPayout: web3.utils.toWei("1", "ether")
        });

        await distributeFees({
            recipients: recipients,
            FeeManager: FeeManager,
            contractAddress: contractAddress,
            expectedPayout: web3.utils.toWei("4.5", "ether")
        });
    });

    it('claimMyTeamFees can only be called by team member', async () => {
        let team = [addresses[1]];
        let FeeManager = await util.deployContract(
            web3,
            "PBFeeManager",
            creator,
            [team],
            web3.utils.toWei("3", "ether")
        );

        await util.expectVMException(
            util.methodWithGas(
                FeeManager.methods.claimMyTeamFees(),
                addresses[2],
            )
        );
    });

    it('distributeTeamFees can only be called by team member', async () => {
        let team = [addresses[1]];
        let FeeManager = await util.deployContract(
            web3,
            "PBFeeManager",
            creator,
            [team],
            web3.utils.toWei("3", "ether")
        );

        await util.expectVMException(
            util.methodWithGas(
                FeeManager.methods.distributeTeamFees(),
                addresses[2],
            )
        );
    });

    it('claimMyTeamFees with 1 team member', async () => {
        let team = [addresses[1]];
        let contractAddress = addresses[2];
        let recipients = [addresses[3], addresses[4]];

        let FeeManager = await createFees({
            team: team,
            contractAddress: contractAddress,
            feesPerEther: web3.utils.toWei(".01", "ether"),
            recipients: recipients,
            expectedRecipientShare: 0.25,
        });

        await payFees({
            contractAddress: contractAddress,
            FeeManager: FeeManager,
            amount: web3.utils.toWei("10", "ether"),
            expectedTeamPayout: web3.utils.toWei("5", "ether")
        });

        await claimMyTeamFees({
            FeeManager: FeeManager,
            team: team,
            expectedPayout: web3.utils.toWei("5", "ether")
        });

        await distributeTeamFees({
            FeeManager: FeeManager,
            team: team,
            expectedPayout: web3.utils.toWei("0", "ether")
        });

        await claimMyTeamFees({
            FeeManager: FeeManager,
            team: team,
            expectedPayout: web3.utils.toWei("0", "ether")
        });
    });

    it('distributeTeamFees with 1 team member', async () => {
        let team = [addresses[1]];
        let contractAddress = addresses[2];
        let recipients = [addresses[3], addresses[4]];

        let FeeManager = await createFees({
            team: team,
            contractAddress: contractAddress,
            feesPerEther: web3.utils.toWei(".01", "ether"),
            recipients: recipients,
            expectedRecipientShare: 0.25,
        });

        await payFees({
            contractAddress: contractAddress,
            FeeManager: FeeManager,
            amount: web3.utils.toWei("10", "ether"),
            expectedTeamPayout: web3.utils.toWei("5", "ether")
        });

        await distributeTeamFees({
            FeeManager: FeeManager,
            team: team,
            expectedPayout: web3.utils.toWei("5", "ether")
        });

        await claimMyTeamFees({
            FeeManager: FeeManager,
            team: team,
            expectedPayout: web3.utils.toWei("0", "ether")
        });

        await distributeTeamFees({
            FeeManager: FeeManager,
            team: team,
            expectedPayout: web3.utils.toWei("0", "ether")
        });
    });

    it('team members cant claim more than their share', async () => {
        let team = [addresses[1], addresses[2], addresses[3]];
        let contractAddress = addresses[4];
        let recipients = [addresses[5], addresses[6]];

        let FeeManager = await createFees({
            team: team,
            contractAddress: contractAddress,
            feesPerEther: web3.utils.toWei(".01", "ether"),
            recipients: recipients,
            expectedRecipientShare: 0.25,
        });

        await web3.eth.sendTransaction({
            from: addresses[7],
            to: FeeManager.options.address,
            value: web3.utils.toWei("3", "ether")
        });

        await payFees({
            contractAddress: contractAddress,
            FeeManager: FeeManager,
            amount: web3.utils.toWei("10", "ether"),
            expectedTeamPayout: web3.utils.toWei("5", "ether")
        });

        await web3.eth.sendTransaction({
            from: addresses[7],
            to: FeeManager.options.address,
            value: web3.utils.toWei("1", "ether")
        });

        for (let i = 0; i < team.length; i++) {
            await claimMyTeamFees({
                FeeManager: FeeManager,
                team: [team[i]],
                expectedPayout: web3.utils.toWei("3", "ether")
            });
            await claimMyTeamFees({
                FeeManager: FeeManager,
                team: [team[i]],
                expectedPayout: web3.utils.toWei("0", "ether")
            });
        }
    });

    it('claimMyTeamFees with more than 1 team member', async () => {
        let team = [addresses[1], addresses[2], addresses[3]];
        let contractAddress = addresses[4];
        let recipients = [addresses[5], addresses[6]];

        let FeeManager = await createFees({
            team: team,
            contractAddress: contractAddress,
            feesPerEther: web3.utils.toWei(".01", "ether"),
            recipients: recipients,
            expectedRecipientShare: 0.25,
        });

        await web3.eth.sendTransaction({
            from: addresses[7],
            to: FeeManager.options.address,
            value: web3.utils.toWei("3", "ether")
        });

        await payFees({
            contractAddress: contractAddress,
            FeeManager: FeeManager,
            amount: web3.utils.toWei("10", "ether"),
            expectedTeamPayout: web3.utils.toWei("5", "ether")
        });

        await web3.eth.sendTransaction({
            from: addresses[7],
            to: FeeManager.options.address,
            value: web3.utils.toWei("1", "ether")
        });

        await claimMyTeamFees({
            FeeManager: FeeManager,
            team: team,
            expectedPayout: web3.utils.toWei("3", "ether")
        });

        await distributeTeamFees({
            FeeManager: FeeManager,
            team: team,
            expectedPayout: web3.utils.toWei("0", "ether")
        });

        await claimMyTeamFees({
            FeeManager: FeeManager,
            team: team,
            expectedPayout: web3.utils.toWei("0", "ether")
        });
    });

    it('distributeTeamFees with more than 1 team member', async () => {
        let team = [addresses[1], addresses[2]];
        let contractAddress = addresses[4];
        let recipients = [addresses[5], addresses[6]];

        let FeeManager = await createFees({
            team: team,
            contractAddress: contractAddress,
            feesPerEther: web3.utils.toWei(".01", "ether"),
            recipients: recipients,
            expectedRecipientShare: 0.25,
        });

        await web3.eth.sendTransaction({
            from: addresses[7],
            to: FeeManager.options.address,
            value: web3.utils.toWei("3", "ether")
        });

        await payFees({
            contractAddress: contractAddress,
            FeeManager: FeeManager,
            amount: web3.utils.toWei("10", "ether"),
            expectedTeamPayout: web3.utils.toWei("5", "ether")
        });

        await web3.eth.sendTransaction({
            from: addresses[7],
            to: FeeManager.options.address,
            value: web3.utils.toWei("1", "ether")
        });

        await distributeTeamFees({
            FeeManager: FeeManager,
            team: team,
            expectedPayout: web3.utils.toWei("4.5", "ether")
        });
    });


    it('claimFees and claimTeem fees with more than 1 team member', async () => {
        let team = [addresses[1], addresses[2], addresses[3]];
        let contractAddress = addresses[4];
        let recipients = [addresses[5], addresses[6]];

        let FeeManager = await createFees({
            team: team,
            contractAddress: contractAddress,
            feesPerEther: web3.utils.toWei(".01", "ether"),
            recipients: recipients,
            expectedRecipientShare: 0.25,
        });

        await web3.eth.sendTransaction({
            from: addresses[7],
            to: FeeManager.options.address,
            value: web3.utils.toWei("3", "ether")
        });

        await claimMyTeamFees({
            FeeManager: FeeManager,
            team: [team[0]],
            expectedPayout: web3.utils.toWei("1", "ether")
        });

        await payFees({
            contractAddress: contractAddress,
            FeeManager: FeeManager,
            amount: web3.utils.toWei("10", "ether"),
            expectedTeamPayout: web3.utils.toWei("5", "ether")
        });

        await claimMyTeamFees({
            FeeManager: FeeManager,
            team: [team[1]],
            expectedPayout: web3.utils.toWei((8/3.0).toString(), "ether")
        });

        await claimMyFees({
            contractAddress: contractAddress,
            recipients: [recipients[0]],
            FeeManager: FeeManager,
            expectedPayout: web3.utils.toWei("2.5", "ether"),
        });

        await web3.eth.sendTransaction({
            from: addresses[7],
            to: FeeManager.options.address,
            value: web3.utils.toWei("1", "ether")
        });

        await claimMyTeamFees({
            FeeManager: FeeManager,
            team: [team[0]],
            expectedPayout: web3.utils.toWei("2", "ether")
        });

        await claimMyFees({
            contractAddress: contractAddress,
            recipients: [recipients[1]],
            FeeManager: FeeManager,
            expectedPayout: web3.utils.toWei("2.5", "ether"),
        });

        await claimMyTeamFees({
            FeeManager: FeeManager,
            team: [team[1]],
            expectedPayout: web3.utils.toWei((1/3.0).toString(), "ether")
        });

        await claimMyTeamFees({
            FeeManager: FeeManager,
            team: [team[2]],
            expectedPayout: web3.utils.toWei("3", "ether")
        });
    });

    describe("token donations", () => {
        let TestToken;
        let FeeManager;
        let blacklisted;
        let memberA;
        let memberB;

        beforeEach(async () => {
            let tokenHolder = addresses[1];
            blacklisted = addresses[2];
            memberA = addresses[3];
            memberB = addresses[4];

            TestToken = await util.deployContract(
                web3,
                "TestToken",
                creator,
                [blacklisted]
            );
            FeeManager = await createFees({
                team: [blacklisted, memberB, memberA],
                contractAddress: addresses[5],
                feesPerEther: web3.utils.toWei(".01", "ether"),
                recipients: [creator],
                expectedRecipientShare: 0.5,
            });

            await web3.eth.sendTransaction({
                from: tokenHolder,
                to: TestToken.options.address,
                value: web3.utils.toWei(".1", "ether")
            });

            await util.methodWithGas(
                TestToken.methods.transfer(
                    FeeManager.options.address,
                    60
                ),
                tokenHolder
            );
        });

        async function tokenBalanceEquals(address, amount) {
            expect(
                parseInt(
                    await TestToken.methods.balanceOf(address).call()
                )
            ).to.equal(amount);
        }

        it("claimMyTeamTokens()", async () => {
            await tokenBalanceEquals(FeeManager.options.address, 60);

            await util.expectVMException(
                util.methodWithGas(
                    FeeManager.methods.claimMyTeamTokens(TestToken.options.address),
                    creator
                )
            );

            await util.methodWithGas(
                FeeManager.methods.claimMyTeamTokens(TestToken.options.address),
                memberA
            );
            await util.methodWithGas(
                FeeManager.methods.claimMyTeamTokens(TestToken.options.address),
                blacklisted
            );
            await util.methodWithGas(
                FeeManager.methods.claimMyTeamTokens(TestToken.options.address),
                memberB
            );
            await util.methodWithGas(
                FeeManager.methods.claimMyTeamTokens(TestToken.options.address),
                memberA
            );

            await tokenBalanceEquals(FeeManager.options.address, 20);

            await tokenBalanceEquals(memberA, 20);
            await tokenBalanceEquals(memberB, 20);
            await tokenBalanceEquals(blacklisted, 0);
        });

        it("distributeTeamTokens()", async () => {
            await tokenBalanceEquals(FeeManager.options.address, 60);

            await util.expectVMException(
                util.methodWithGas(
                    FeeManager.methods.distributeTeamTokens(TestToken.options.address),
                    creator
                )
            );

            await util.methodWithGas(
                FeeManager.methods.distributeTeamTokens(TestToken.options.address),
                memberA
            );
            await util.methodWithGas(
                FeeManager.methods.distributeTeamTokens(TestToken.options.address),
                memberB
            );

            await tokenBalanceEquals(FeeManager.options.address, 20);

            await tokenBalanceEquals(memberA, 20);
            await tokenBalanceEquals(memberB, 20);
            await tokenBalanceEquals(blacklisted, 0);
        });
    });

});
