pragma solidity ^0.4.15;

library Util {

    function min(uint a, uint b) pure internal returns (uint _min) {
        if (a < b) {
            return a;
        }
        return b;
    }

    function contains(address[] storage list, address addr) internal constant returns (bool) {
        for (uint i = 0; i < list.length; i++) {
            if (list[i] == addr) {
                return true;
            }
        }
        return false;
    }
}