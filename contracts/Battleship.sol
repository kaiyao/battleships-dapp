pragma solidity ^0.4.23;

contract Battleship {
    
    uint constant boardWidth = 10;
    uint constant boardHeight = 10;
    uint constant shipsPerPlayer = 5;
    uint[5] boardShips = [5, 4, 3, 3, 2];
    
    struct Ship {
        uint width;
        uint height;
        uint x;
        uint y;
    }
    
    enum MoveResult { Unknown, Miss, Hit }
    
    struct Move {
        uint x;
        uint y;
        MoveResult result;
    }

    struct PlayerInfo {
        address player;
        Ship[shipsPerPlayer] revealShips;
        uint revealShipsCount;
        bytes32 revealNonce;
        bytes32 commitHash;
        bytes32 commitNonceHash;
        Move[boardWidth * boardHeight] moves;
        uint movesCount;
    }
    
    enum GameState { Created, Started, Finished, Paid }
    GameState public gameState;
    
    address public player1;
    address public player2;
    address winner;
    
    mapping (address => PlayerInfo) private players;
    uint playerCount;
    
    constructor() public {
        players[msg.sender].player = msg.sender;
        player1 = msg.sender;
        playerCount++;
        
        gameState = GameState.Created;
    }

    function addOpponent(address opponent) public {

    } 
    
    function joinGame() public {
        require(gameState == GameState.Created);
        require(players[msg.sender].player == 0 && playerCount < 2);
        players[msg.sender].player = msg.sender;
        player2 = msg.sender;
        playerCount++;
    }
    
    function submitCommitHash(bytes32 commitHash, bytes32 commitNonceHash) public {
        require(gameState == GameState.Created);
        players[msg.sender].commitHash = commitHash;
        players[msg.sender].commitNonceHash = commitNonceHash;
        
        if (
            players[player1].commitHash != "" && players[player2].commitHash != "" &&
            players[player1].commitNonceHash != "" && players[player2].commitNonceHash != ""
        ) {
            gameState = GameState.Started;
        }
    }
    
    function makeMove(uint x, uint y) public {
        require(gameState == GameState.Started);
        require(playerCount >= 2);
        // Check that the user has placed the hash of their ships
        require(players[msg.sender].commitHash != "" && players[msg.sender].commitNonceHash != "");
        // Check that it is the player's turn
        require(
            (msg.sender == player1 && players[player1].movesCount >= players[player2].movesCount) || 
            (msg.sender == player2 && players[player2].movesCount < players[player1].movesCount)
        );
        // Check that player has already submitted move result for previous opponent move
        require(
            (msg.sender == player1 && players[player1].movesCount == 0) ||
            (msg.sender == player1 && players[player2].moves[players[player2].movesCount - 1].result != MoveResult.Unknown) || 
            (msg.sender == player2 && players[player1].moves[players[player1].movesCount - 1].result != MoveResult.Unknown)
        );
        
        players[msg.sender].moves[players[msg.sender].movesCount] = Move(x, y, MoveResult.Unknown);
        players[msg.sender].movesCount++;
    }
    
    function updateLastOpponentMoveWithResult(MoveResult result) public {
        require(gameState == GameState.Started);
        
        // You cannot update with "unknown" result
        require(result == MoveResult.Hit || result == MoveResult.Miss);
        address opponent = player1;
        if (msg.sender == player1) {
            opponent = player2;
        }
        uint opponentMoveCount = players[opponent].movesCount;
        require(players[opponent].moves[opponentMoveCount - 1].result == MoveResult.Unknown);
        
        players[opponent].moves[opponentMoveCount - 1].result = result;
    }
    
    function setGameEnd() public {
        require(gameState == GameState.Started);
        gameState = GameState.Finished;
    }
    
    function revealShip(uint width, uint height, uint x, uint y) public {
        require(gameState == GameState.Finished);
        require(width == 1 || height == 1);
        require(x + width <= boardWidth);
        require(y + height <= boardWidth);
        require(
            (boardShips[players[msg.sender].revealShipsCount] == width && height == 1) || 
            (boardShips[players[msg.sender].revealShipsCount] == height && width == 1)
        );
        
        players[msg.sender].revealShips[players[msg.sender].revealShipsCount] = Ship(width, height, x, y);
    }
    
    function revealNonce(bytes32 nonce) public {
        require(gameState == GameState.Finished);
        players[msg.sender].revealNonce = nonce;
    }
    
    function checkWinner() public {
        require(gameState == GameState.Finished);
        // Check that both players have submitted their ships and nonce
        require(players[player1].revealShipsCount == boardShips.length);
        require(players[player2].revealShipsCount == boardShips.length);
        require(players[player1].revealNonce != "");
        require(players[player2].revealNonce != "");
    }
    
}