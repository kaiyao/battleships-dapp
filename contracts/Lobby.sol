pragma solidity ^0.4.24;

import "./Battleship.sol";

contract Lobby {

    address owner;
    mapping (address => address[]) public games;
    address[] public openGames;

    constructor() public {
        owner = msg.sender;
    }

    function getGamesBelongingToPlayer() public view returns (address[]) {
        return games[msg.sender];
    }

    function getOpenGames() public view returns (address[]) {
        return openGames;
    }

    function createOpenGame() public payable returns (address) {
        address newContract = new Battleship();
        Battleship(newContract).joinPlayer(msg.sender);
        games[msg.sender].push(newContract);
        openGames.push(newContract);
        return newContract;
    }

    function createGameWithOpponent(address opponent) public payable returns (address) {
        address newContract = new Battleship();
        Battleship(newContract).joinPlayer(msg.sender);
        Battleship(newContract).joinPlayer(opponent);
        games[msg.sender].push(newContract);
        games[opponent].push(newContract);
        return newContract;
    }

    function joinOpenGame(uint gameIndex) public payable returns (address) {
        address gameAddress = openGames[gameIndex];

        Battleship(gameAddress).joinPlayer(msg.sender);
        games[msg.sender].push(gameAddress);
        delete openGames[gameIndex];

        return gameAddress;
    }
}