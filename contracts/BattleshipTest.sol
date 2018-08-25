pragma solidity ^0.4.23;

import "./Battleship.sol";

contract BattleshipTest is Battleship {

    constructor(uint _betAmount, uint _timestamp) Battleship (_betAmount) public {
        testMode = true;
        testModeTimestamp = _timestamp;
    }

    function setTestMode() public onlyOwner {
        testMode = true;
    }

    function setTimestamp(uint _timestamp) public {
        require(testMode, "Test mode only");
        testModeTimestamp = _timestamp;
    }

    // get player moves packed is used in main game

    function batchMakeMove(uint[] _x, uint[] _y, MoveResult[] _result, uint[] _shipNumber) public onlyOwner {
        require(testMode);
        
        for (uint i = 0; i < _x.length; i++) {
            uint x = _x[i];
            uint y = _y[i];
            MoveResult result = _result[i];
            uint shipNumber = _shipNumber[i];

            address player = getWhoseTurn();
            uint playerMoveCount = getPlayerMovesCount(player);
            players[player].moves[playerMoveCount] = Move(x, y, result, shipNumber);
            players[player].movesCount = playerMoveCount + 1;
        }
    }
}