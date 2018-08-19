pragma solidity ^0.4.24;

import "./Battleship.sol";

contract Lobby {

    address owner;
    mapping (address => address[]) public games;

    constructor() public {
        owner = msg.sender;
    }

    function getGamesBelongingToPlayer() public view returns (address[]) {
        return games[msg.sender];
    }

    function createGame() public payable returns (address) {
        address newContract = new Battleship();
        games[msg.sender].push(newContract);
        return newContract;
    }

    function joinGame() public {

    }
}