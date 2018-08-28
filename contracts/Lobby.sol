pragma solidity ^0.4.24;

import "./Battleship.sol";
import "../node_modules/openzeppelin-solidity/contracts/ownership/Ownable.sol";
import "../node_modules/openzeppelin-solidity/contracts/lifecycle/Destructible.sol";

/** @title Game lobby contract */
contract Lobby is Ownable, Destructible {

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

    event GameEmergencyStopped (
        address indexed _from,
        address indexed _gameAddress
    );

    event GameDestroyed (
        address indexed _from,
        address indexed _gameAddress
    );

    event GameDestroyedAndSend (
        address indexed _from,
        address indexed _gameAddress,
        address indexed _recipient
    );

    /** @dev Constructor for this contract. Currently does nothing but the 
      *      owner is stored because the contract inherits from Ownable.
      */
    constructor() public {

    }

    /** @dev Gets the list of games whereby the sender is involved.
      * @return Array of addresses to the Battleship game contracts that the sender is in
      */
    function getGamesBelongingToPlayer() public view returns (address[]) {
        return games[msg.sender];
    }

    /** @dev Gets the list of games which only have one player and are waiting for a second player to join (open games)
      * @return Array of addresses to the Battleship game contracts with only one player
      */
    function getOpenGames() public view returns (address[]) {
        return openGames;
    }

    /** @dev Creates a new open game with the sender for another player to join
      * @param betAmount The amount (in wei) that the sender wants to set as the bet to be placed for players in the game
      * @return Address to the Battleship game contract deployed
      */
    function createOpenGame(uint betAmount) public payable returns (address) {
        address newContract = new Battleship(betAmount);
        games[msg.sender].push(newContract);
        openGames.push(newContract);
        Battleship(newContract).joinGameForPlayer(msg.sender);
        emit OpenGameCreated(msg.sender, newContract);
        return newContract;
    }

    /** @dev Creates a new game with the sender and another opponent
      * @param opponent Address of an opponent account
      * @param betAmount The amount (in wei) that the sender wants to set as the bet to be placed for players in the game
      * @return Address to the Battleship game contract deployed
      */
    function createGameWithOpponent(address opponent, uint betAmount) public payable returns (address) {
        address newContract = new Battleship(betAmount);
        games[msg.sender].push(newContract);
        games[opponent].push(newContract);
        Battleship(newContract).joinGameForPlayer(msg.sender);
        Battleship(newContract).joinGameForPlayer(opponent);
        emit GameWithOpponentCreated(msg.sender, opponent, newContract);
        return newContract;
    }

    /** @dev Join an open game
      * @param gameIndex The index of the openGames array that corresponds to the game that the player wants to join
      *                  Note that the index is fixed, deletion of old games does not change the index
      * @return Address to the Battleship game contract joined
      */
    function joinOpenGame(uint gameIndex) public payable returns (address) {
        address gameAddress = openGames[gameIndex];        
        games[msg.sender].push(gameAddress);
        delete openGames[gameIndex];
        Battleship(gameAddress).joinGameForPlayer(msg.sender);
        emit OpenGameJoined(msg.sender, gameAddress);

        return gameAddress;
    }

    /** @dev Emergency stop a game
      * @param gameAddress Address to the Battleship game
      * @return Address to the Battleship game
      */
    function emergencyStopGame(address gameAddress) public onlyOwner returns (address) {
        Battleship(gameAddress).emergencyStop();
        emit GameEmergencyStopped(msg.sender, gameAddress);
        return gameAddress;
    }

    /** @dev Destroy a game
      * @param gameAddress Address to the Battleship game
      * @return Address to the Battleship game
      */
    function destroyGame(address gameAddress) public onlyOwner returns (address) {
        Battleship(gameAddress).destroy();
        emit GameDestroyed(msg.sender, gameAddress);
        return gameAddress;
    }

    /** @dev Destroy a game and send ether to address
      * @param gameAddress Address to the Battleship game
      * @return Address to the Battleship game
      */
    function destroyGameAndSend(address gameAddress, address recipient) public onlyOwner returns (address) {
        Battleship(gameAddress).destroyAndSend(recipient);
        emit GameDestroyedAndSend(msg.sender, gameAddress, recipient);
        return gameAddress;
    }
    
}