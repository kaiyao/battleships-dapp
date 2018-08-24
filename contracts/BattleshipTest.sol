pragma solidity ^0.4.23;

import "./Battleship.sol";

contract BattleshipTest is Battleship {

    bool public testMode;

    constructor() public {
        testMode = true;
    }

    function setTimestamp(uint _timestamp) public {
        require(testMode, "Test mode only");
        testModeTimestamp = _timestamp;
    }

    function getRevealShipsPackedForPlayer(address player) public view returns (uint[shipsPerPlayer], uint[shipsPerPlayer], uint[shipsPerPlayer], uint[shipsPerPlayer]) {
        uint[shipsPerPlayer] memory width;
        uint[shipsPerPlayer] memory height;
        uint[shipsPerPlayer] memory x;
        uint[shipsPerPlayer] memory y;
        for (uint i = 0; i < shipsPerPlayer; i++) {
            Ship memory ship = players[player].revealShips[i];
            width[i] = ship.width;
            height[i] = ship.height;
            x[i] = ship.x;
            y[i] = ship.y;
        }
        return (width, height, x, y);
    }

    function getRevealShipsCountForPlayer(address player) public view returns (uint) {
        return players[player].revealShipsCount;
    }

    function setRevealShipsPackedForPlayer(address player, uint revealShipsCount, uint[shipsPerPlayer] width, uint[shipsPerPlayer] height, uint[shipsPerPlayer] x, uint[shipsPerPlayer] y) public onlyOwner {
        require(testMode, "Test Mode only");
        players[player].revealShipsCount = revealShipsCount;
        for (uint i = 0; i < shipsPerPlayer; i++) {
            players[player].revealShips[i] = Ship(width[i], height[i], x[i], y[i]);
        }
    }

    function getHitCountForPlayer(address player) public view returns (uint) {
        return players[player].hitCount;
    }

    function setHitCountForPlayer(address player, uint hitCount) public {
        require(testMode, "Test Mode only");
        players[player].hitCount = hitCount;
    }

    function getPerShipHitCountForPlayer(address player) public view returns (uint[shipsPerPlayer]) {
        return players[player].perShipHitCount;
    }

    function setPerShipHitCountForPlayer(address player, uint[shipsPerPlayer] perShipHitCount) public {
        require(testMode, "Test Mode only");
        players[player].perShipHitCount = perShipHitCount;
    }
}