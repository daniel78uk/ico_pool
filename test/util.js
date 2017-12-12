const fs = require("fs");
const chai = require('chai');
const solc = require('solc')

const expect = chai.expect;

function findImports (name) {
    let path = `./contracts/${name}`;
    try {
        let source = fs.readFileSync(path, 'utf8');
        return { contents: source };
    } catch (error) {
        return { error: 'File not found' };
    }
}

let libs = ["Util", "Fraction", "QuotaTracker"];
let compileCache = {};

function compileContract(contractName) {
    if (compileCache[contractName]) {
        return compileCache[contractName];
    }

    let content = fs.readFileSync(`./contracts/${contractName}.sol`, 'utf8');
    let = key = `${contractName}.sol`;
    let input = {};
    input[key] = content;

    compileCache[contractName] = solc.compile(
        { sources: input }, 1, findImports
    );
    return compileCache[contractName];
}

function contractNameToKey(contractName) {
    return `${contractName}.sol:${contractName}`;
}

async function deployCompiledContract(web3, bytecode, abi, creatorAddress, contractArgs, initialBalance) {
    let Contract = new web3.eth.Contract(JSON.parse(abi));
    let deploy = Contract.deploy({ data: bytecode, arguments: contractArgs });
    initialBalance = initialBalance || 0;

    let gasEstimate =  await deploy.estimateGas({ from: creatorAddress, value: initialBalance });

    let sendOptions = {
        from: creatorAddress,
        gas: gasEstimate,
        value: initialBalance
    };

    return await deploy.send(sendOptions);
}

async function deployContractHelper(web3, contractName, creatorAddress, libMapping, contractArgs, initialBalance) {
    let result = compileContract(contractName);
    let compiledContract = result.contracts[contractNameToKey(contractName)];

    for (let i= 0; i < libs.length; i++) {
        let libName = libs[i];
        if (libName === contractName) {
            continue;
        }

        let key = contractNameToKey(libName);

        if (result.contracts[key] && !libMapping[key]) {
            let deployedLib =  await deployContractHelper(
                web3,
                libName,
                creatorAddress,
                libMapping,
                []
            );
            libMapping[key] = deployedLib.options.address;
        }
    }

    return await deployCompiledContract(
        web3,
        solc.linkBytecode(compiledContract.bytecode, libMapping),
        compiledContract.interface,
        creatorAddress,
        contractArgs,
        initialBalance
    );
}

async function deployContract(web3, contractName, creatorAddress, contractArgs, initialBalance) {
    return await deployContractHelper(
        web3,
        contractName,
        creatorAddress,
        {},
        contractArgs,
        initialBalance
    );
}

function createPoolArgs(options) {
    let args = [];
    options = options || {};
    args.push(options.feeManager || "1111111111111111111111111111111111111111");
    args.push(options.feesPerEther || 0);
    args.push(options.minContribution || 0);
    args.push(options.maxContribution || 0);
    args.push(options.maxPoolBalance || 0);
    args.push(options.admins || []);
    args.push(options.restricted || false);

    return args;
}

function expectVMException(prom) {
    return new Promise(
        function (resolve, reject) {
            prom.catch((e) => {
                expect(e.message).to.include("invalid opcode")
                resolve(e);
            });
        }
    );
}

async function methodWithGas(method, from, value) {
    let txn = { from: from, gas: 1000000 };
    if (value) {
        txn.value = value;
    }
    return await method.send(txn);
}

async function getBalances(PresalePool) {
    let participantBalances = await PresalePool.methods.getParticipantBalances().call();
    let addresses = participantBalances[0];
    let contribution = participantBalances[1];
    let remaining = participantBalances[2];
    let whitelisted = participantBalances[3];
    let exists = participantBalances[4];

    expect(addresses.length)
    .to.equal(contribution.length)
    .to.equal(remaining.length)
    .to.equal(whitelisted.length)
    .to.equal(exists.length);

    let balances = {};
    contribution.forEach((val, i) => {
        balances[addresses[i].toLowerCase()] = {
            contribution: contribution[i],
            remaining: remaining[i],
            whitelisted: whitelisted[i],
            exists: exists[i]
        };
    });
    return balances;
}

async function verifyState(web3, PresalePool, expectedBalances, expectedPoolBalance) {
    let balances = await getBalances(PresalePool);

    let totalContribution = 0;
    Object.values(balances).forEach((value) => {
        totalContribution += parseInt(value.contribution);
    });

    for (let [address, balance] of Object.entries(expectedBalances)) {
        expect(balances[address]).to.include(balance);
    }

    let contractBalance = await web3.eth.getBalance(
        PresalePool.options.address
    );
    expect(contractBalance).to.equal(expectedPoolBalance);

    let poolContributionBalance = await PresalePool.methods.poolContributionBalance().call();
    expect(parseInt(poolContributionBalance)).to.equal(totalContribution);
}

async function expectBalanceChangeAddresses(web3, addresses, expectedDifference, operation) {
    return expectBalanceChanges(
        web3,
        addresses,
        Array(addresses.length).fill(expectedDifference),
        operation
    );
}

async function expectBalanceChanges(web3, addresses, differences, operation) {
    let beforeBalances = [];

    for (let i = 0; i < addresses.length; i++) {
        beforeBalances.push(await web3.eth.getBalance(addresses[i]));
    }
    await operation();

    for (let i = 0; i < addresses.length; i++) {
        let balanceAfterRefund = await web3.eth.getBalance(addresses[i]);
        let difference = parseInt(balanceAfterRefund) - parseInt(beforeBalances[i]);
        let expectedDifference = differences[i];
        if (expectedDifference == 0) {
            let differenceInEther = parseFloat(
                web3.utils.fromWei(difference.toString(), "ether")
            );
            expect(differenceInEther).to.be.closeTo(0, 0.01);
        } else {
            expect(difference / expectedDifference).to.be.within(.98, 1.0);
        }
    }
}

async function expectBalanceChange(web3, address, expectedDifference, operation) {
    let balance = await web3.eth.getBalance(address);
    await operation();
    let balanceAfterRefund = await web3.eth.getBalance(address);
    let difference = parseInt(balanceAfterRefund) - parseInt(balance);
    if (expectedDifference == 0) {
        let differenceInEther = parseFloat(
            web3.utils.fromWei(difference.toString(), "ether")
        );
        expect(differenceInEther).to.be.closeTo(0, 0.01);
    } else {
        expect(difference / expectedDifference).to.be.within(.98, 1.0);
    }
}

module.exports = {
    createPoolArgs: createPoolArgs,
    deployContract: deployContract,
    expectBalanceChange: expectBalanceChange,
    expectBalanceChanges: expectBalanceChanges,
    expectBalanceChangeAddresses: expectBalanceChangeAddresses,
    expectVMException: expectVMException,
    getBalances: getBalances,
    methodWithGas: methodWithGas,
    verifyState: verifyState,
}
