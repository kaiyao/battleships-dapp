pragma solidity ^0.4.24;

import "./Battleship.sol";

contract Lobby is Ownable {

    mapping (address => address[]) public games;
    address[] public openGames;

    event OpenGameCreated (
        address indexed _from,
        address indexed _gameAddress
    );

    event OpenGameJoined (
        address indexed _from,
        address indexed _gameAddress
    );

    event GameWithOpponentCreated (
        address indexed _from,
        address indexed _opponent,
        address indexed _gameAddress
    );

    constructor() public {

    }

    function getGamesBelongingToPlayer() public view returns (address[]) {
        return games[msg.sender];
    }

    function getOpenGames() public view returns (address[]) {
        return openGames;
    }

    function createOpenGame(uint betAmount) public payable returns (address) {
        address newContract = new Battleship(betAmount);
        games[msg.sender].push(newContract);
        openGames.push(newContract);
        Battleship(newContract).joinGameForPlayer(msg.sender);
        emit OpenGameCreated(msg.sender, newContract);
        return newContract;
    }

    function createGameWithOpponent(address opponent, uint betAmount) public payable returns (address) {
        address newContract = new Battleship(betAmount);
        games[msg.sender].push(newContract);
        games[opponent].push(newContract);
        Battleship(newContract).joinGameForPlayer(msg.sender);
        Battleship(newContract).joinGameForPlayer(opponent);
        emit GameWithOpponentCreated(msg.sender, opponent, newContract);
        return newContract;
    }

    function joinOpenGame(uint gameIndex) public payable returns (address) {
        address gameAddress = openGames[gameIndex];        
        games[msg.sender].push(gameAddress);
        delete openGames[gameIndex];
        Battleship(gameAddress).joinGameForPlayer(msg.sender);
        emit OpenGameJoined(msg.sender, gameAddress);

        return gameAddress;
    }
}