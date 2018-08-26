pragma solidity ^0.4.23;

import "./Battleship.sol";

contract BattleshipTest is Battleship {

    constructor(uint _betAmount, uint _timestamp) Battleship (_betAmount) public {
        testMode = true;
        testModeTimestamp = _timestamp;
    }

    /** @dev Sets the game to test mode. Not really necessary since already set in the constructor
      *      but left here for legacy reasons.
      */
    function setTestMode() public onlyOwner {
        testMode = true;
    }

    /** @dev Sets the timestamp used by functions in the game. This is to allow advancing time
      *      in the unit tests to test the functions involving timeouts.
      * @param _timestamp The timestamp to set (in seconds since the unix epoch)
      */
    function setTimestamp(uint _timestamp) public {
        require(testMode, "Test mode only");
        testModeTimestamp = _timestamp;
    }

    /** @dev Sets the game end state. Normally the game end state cannot be changed directly
      *      and is instead determined by the contract logic. This function exists to facilitate
      *      testing of functions involving the game end state.
      * @param state The GameEndState to set to
      */
    function setGameEndState(GameEndState state) public {
        gameState = GameState.Ended;
        gameEndState = state;
    }
    
    /** @dev Test processing the winnings (sending winnings/refunds) based on the end game state.
      *      In the Battleship contract, processWinnings is a private function that cannot be called
      *      externally. This function exists to let it be called by the unit test.
      */
    function processWinningsTest() public {
        processWinnings();
    }

    // a function, get player moves packed, is used in main game, so it has been moved there

    /** @dev Batch make moves. Normally a user can only make one move in each contract. This is very
      *      slow for testing scenarios near the end of the game, so this function exists to facilitate
      *      that testing in the unit tests. Each move alternates between players.
      *
      * @param _x Array of each move's x coordinate
      * @param _y Array of each move's y coordinate
      * @param _result Array of each move's result
      * @param _shipNumber Array of each move's ship number (if result is "Hit")
      */
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