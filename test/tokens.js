const chai = require('chai');

const server = require('./server');
const util = require('./util');

const expect = chai.expect;

describe('setToken', () => {
    let creator;
    let buyer1;
    let buyer2;
    let blacklistedBuyer;
    let tokenHolder;
    let web3;

    before(async () => {
        let result = await server.setUp();
        web3 = result.web3;
        creator = result.addresses[0].toLowerCase();
        buyer1 = result.addresses[1].toLowerCase();
        buyer2 = result.addresses[2].toLowerCase();
        blacklistedBuyer = result.addresses[3].toLowerCase();
        tokenHolder = result.addresses[4];
    });


    after(async () => {
        await server.tearDown();
    });

    let PresalePool;
    let TestToken;
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
        TestToken = await util.deployContract(
            web3,
            "TestToken",
            creator,
            [blacklistedBuyer]
        );
    });

    it("setToken() cant be called in failed state", async () => {
        await util.methodWithGas(PresalePool.methods.fail(), creator);
        await util.expectVMException(
            util.methodWithGas(
                PresalePool.methods.setToken(TestToken.options.address, true),
                creator
            )
        );
    });

    it("setToken() cant be called in refunded state", async () => {
        await util.methodWithGas(
            PresalePool.methods.deposit(),
            creator,
            web3.utils.toWei("2", "ether")
        );
        await util.methodWithGas(
            PresalePool.methods.payToPresale(creator, 0),
            creator
        );
        await util.methodWithGas(
            PresalePool.methods.expectRefund(creator),
            creator
        );
        await util.expectVMException(
            util.methodWithGas(
                PresalePool.methods.setToken(TestToken.options.address, true),
                creator
            )
        );
    });

    it("setToken() can be called in open state", async () => {
        await util.methodWithGas(
            PresalePool.methods.setToken(TestToken.options.address, true),
            creator
        );
    });

    it("setToken() can only be called by creator", async () => {
        await util.expectVMException(
            util.methodWithGas(
                PresalePool.methods.setToken(TestToken.options.address, true),
                buyer1
            )
        );

        await util.methodWithGas(
            PresalePool.methods.setToken(TestToken.options.address, true),
            creator
        );
    });

    it("setToken() cant be called again once tokens have already been claimed", async () => {
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
            PresalePool.methods.setToken(TestToken.options.address, true),
            creator
        );
        await util.methodWithGas(PresalePool.methods.transferTokensTo([creator]), creator);

        let OtherTestToken = await util.deployContract(
            web3,
            "TestToken",
            creator,
            [blacklistedBuyer]
        );
        await util.expectVMException(
            util.methodWithGas(
                PresalePool.methods.setToken(OtherTestToken.options.address, true),
                creator
            )
        );
    });

    it("setToken() can be called multiple times if no one has claimed tokens", async () => {
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
            PresalePool.methods.setToken(TestToken.options.address, true),
            creator
        );
        let OtherTestToken = await util.deployContract(
            web3,
            "TestToken",
            creator,
            [blacklistedBuyer]
        );
        await util.methodWithGas(
            PresalePool.methods.setToken(OtherTestToken.options.address, true),
            creator
        );
    });

    it("tokens can can only be claimed when allowTokenClaiming is true", async () => {
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
            PresalePool.methods.setToken(TestToken.options.address, false),
            creator
        );

        await util.expectVMException(
            util.methodWithGas(PresalePool.methods.transferAllTokens(), creator)
        );
        await util.expectVMException(
            util.methodWithGas(PresalePool.methods.transferTokensTo([creator]), creator)
        );
    });

    it("tokens cant be claimed in open state", async () => {
        await util.expectVMException(
            util.methodWithGas(PresalePool.methods.transferAllTokens(), creator)
        );
        await util.expectVMException(
            util.methodWithGas(PresalePool.methods.transferTokensTo([creator]), creator)
        );
    });

    it("tokens cant be claimed in failed state", async () => {
        await util.methodWithGas(PresalePool.methods.fail(), creator);
        await util.expectVMException(
            util.methodWithGas(PresalePool.methods.transferAllTokens(), creator)
        );
        await util.expectVMException(
            util.methodWithGas(PresalePool.methods.transferTokensTo([creator]), creator)
        );
    });

    it("tokens cant be claimed in refunded state", async () => {
        await util.methodWithGas(
            PresalePool.methods.deposit(),
            creator,
            web3.utils.toWei("2", "ether")
        );
        await util.methodWithGas(
            PresalePool.methods.payToPresale(creator, 0),
            creator
        );
        await util.methodWithGas(
            PresalePool.methods.expectRefund(creator),
            creator
        );

        await util.expectVMException(
            util.methodWithGas(PresalePool.methods.transferAllTokens(), creator)
        );
        await util.expectVMException(
            util.methodWithGas(PresalePool.methods.transferTokensTo([creator]), creator)
        );
    });

    describe("claim tokens", async () => {
        async function setUpPaidPoolWithTokens() {
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
                    0, web3.utils.toWei("2", "ether"), web3.utils.toWei("3", "ether"), []
                ),
                creator
            );
            await util.methodWithGas(
                PresalePool.methods.payToPresale(
                    TestToken.options.address,
                    0
                ),
                creator
            );

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
            await util.verifyState(web3, PresalePool, expectedBalances, web3.utils.toWei("5", "ether"));

            expect(await TestToken.methods.totalTokens().call())
            .to.equal("940");

            await util.methodWithGas(
                PresalePool.methods.setToken(TestToken.options.address, true),
                creator
            );
        }

        async function transferMoreTokensToPool(amount) {
            await web3.eth.sendTransaction({
                from: tokenHolder,
                to: TestToken.options.address,
                value: web3.utils.toWei(".1", "ether")
            });

            await util.methodWithGas(
                TestToken.methods.transfer(
                    PresalePool.options.address,
                    amount
                ),
                tokenHolder
            );
        }

        async function tokenBalanceEquals(address, amount) {
            expect(
                parseInt(
                    await TestToken.methods.balanceOf(address).call()
                )
            ).to.equal(amount);
        }

        it("transferAllTokens()", async () => {
            await setUpPaidPoolWithTokens();

            // calling multiple consecutive times doesn't give you more tokens
            await util.expectBalanceChanges(
                web3,
                [creator, buyer1, buyer2],
                [0, 4, 1].map(x => web3.utils.toWei(x.toString(), "ether")),
                () => {
                        return util.methodWithGas(PresalePool.methods.transferAllTokens(), creator);
                }
            );
            await util.expectBalanceChangeAddresses(web3, [creator, buyer1, buyer2], web3.utils.toWei("0", "ether"), () => {
                return util.methodWithGas(PresalePool.methods.transferAllTokens(), creator);
            });

            await tokenBalanceEquals(creator, 40);
            await tokenBalanceEquals(buyer1, 20);
            await tokenBalanceEquals(buyer2, 0);

            await transferMoreTokensToPool(18);

            await util.expectBalanceChangeAddresses(web3, [creator, buyer1, buyer2], web3.utils.toWei("0", "ether"), () => {
                return util.methodWithGas(PresalePool.methods.transferAllTokens(), creator);
            });

            await tokenBalanceEquals(creator, 52);
            await tokenBalanceEquals(buyer1, 26);
            await tokenBalanceEquals(buyer2, 0);

            let expectedBalances = {};
            expectedBalances[creator] = {
                remaining: web3.utils.toWei("0", "ether"),
                contribution: web3.utils.toWei("2", "ether")
            }
            expectedBalances[buyer1] = {
                remaining: web3.utils.toWei("0", "ether"),
                contribution: web3.utils.toWei("1", "ether")
            }
            expectedBalances[buyer2] = {
                remaining: web3.utils.toWei("0", "ether"),
                contribution: web3.utils.toWei("0", "ether")
            }
            await util.verifyState(web3, PresalePool, expectedBalances, web3.utils.toWei("0", "ether"));
        });

        it("transferTokensTo()", async () => {
            await setUpPaidPoolWithTokens();

            // calling multiple consecutive times doesn't give you more tokens
            await util.expectBalanceChanges(
                web3,
                [creator, buyer1, buyer2],
                [0, 4, 1].map(x => web3.utils.toWei(x.toString(), "ether")),
                () => {
                    return util.methodWithGas(
                        PresalePool.methods.transferTokensTo([creator, buyer1, buyer2]),
                        creator
                    );
                }
            );
            await util.expectBalanceChangeAddresses(web3, [creator, buyer1, buyer2], web3.utils.toWei("0", "ether"), () => {
                return util.methodWithGas(
                    PresalePool.methods.transferTokensTo([creator, buyer1, buyer2]),
                    creator
                );
            });

            await tokenBalanceEquals(creator, 40);
            await tokenBalanceEquals(buyer1, 20);
            await tokenBalanceEquals(buyer2, 0);

            await transferMoreTokensToPool(18);

            await util.expectBalanceChangeAddresses(web3, [creator, buyer1, buyer2], web3.utils.toWei("0", "ether"), () => {
                return util.methodWithGas(
                    PresalePool.methods.transferTokensTo([creator]),
                    creator
                );
            });

            await tokenBalanceEquals(creator, 52);
            await tokenBalanceEquals(buyer1, 20);
            await tokenBalanceEquals(buyer2, 0);

            let expectedBalances = {};
            expectedBalances[creator] = {
                remaining: web3.utils.toWei("0", "ether"),
                contribution: web3.utils.toWei("2", "ether")
            }
            expectedBalances[buyer1] = {
                remaining: web3.utils.toWei("0", "ether"),
                contribution: web3.utils.toWei("1", "ether")
            }
            expectedBalances[buyer2] = {
                remaining: web3.utils.toWei("0", "ether"),
                contribution: web3.utils.toWei("0", "ether")
            }
            await util.verifyState(web3, PresalePool, expectedBalances, web3.utils.toWei("0", "ether"));
        });

        it("skips blacklisted sender", async () => {
            await util.methodWithGas(
                PresalePool.methods.deposit(),
                buyer1,
                web3.utils.toWei("5", "ether")
            );
            await util.methodWithGas(
                PresalePool.methods.deposit(),
                blacklistedBuyer,
                web3.utils.toWei("5", "ether")
            );

            await util.methodWithGas(
                PresalePool.methods.payToPresale(
                    TestToken.options.address,
                    0
                ),
                creator
            );

            let expectedBalances = {}
            expectedBalances[buyer1] = {
                remaining: web3.utils.toWei("0", "ether"),
                contribution: web3.utils.toWei("5", "ether")
            }
            expectedBalances[blacklistedBuyer] = {
                remaining: web3.utils.toWei("0", "ether"),
                contribution: web3.utils.toWei("5", "ether")
            }
            await util.verifyState(web3, PresalePool, expectedBalances, web3.utils.toWei("0", "ether"));

            expect(await TestToken.methods.totalTokens().call())
            .to.equal("940");

            await util.methodWithGas(
                PresalePool.methods.setToken(TestToken.options.address, true),
                creator
            );

            await util.methodWithGas(
                PresalePool.methods.transferTokensTo([
                    blacklistedBuyer, blacklistedBuyer, buyer1, buyer2, buyer1, creator
                ]),
                creator
            );

            await tokenBalanceEquals(PresalePool.options.address, 30);
            await tokenBalanceEquals(buyer1, 30);
            await tokenBalanceEquals(buyer2, 0);
            await tokenBalanceEquals(blacklistedBuyer, 0);
            await tokenBalanceEquals(creator, 0);

            await util.methodWithGas(PresalePool.methods.transferAllTokens(), creator);

            await tokenBalanceEquals(PresalePool.options.address, 30);
            await tokenBalanceEquals(buyer1, 30);
            await tokenBalanceEquals(buyer2, 0);
            await tokenBalanceEquals(blacklistedBuyer, 0);
            await tokenBalanceEquals(creator, 0);
        });
    });
});
