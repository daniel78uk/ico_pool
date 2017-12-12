pragma solidity ^0.4.17;

library Fraction {

    function shareOf(uint[2] fraction, uint total) pure internal returns (uint) {
        return (total * fraction[0]) / fraction[1];
    }
}