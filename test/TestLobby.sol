pragma solidity ^0.4.24;

import "truffle/Assert.sol";
import "truffle/DeployedAddresses.sol";
import "../contracts/Lobby.sol";

contract TestLobby {
    Lobby lobby = Lobby(DeployedAddresses.Lobby());

    /*function testUserCanCreateNewOpenGame() public {
        assert(lobby.getGamesBelongingToPlayer().length == 0);
        lobby.createOpenGame();
        assert(lobby.getGamesBelongingToPlayer().length == 1);
        assert(Battleship(lobby.getGamesBelongingToPlayer()[0]).player1 == msg.sender);
        
    }

    function testUserCanCreateNewGameWithOpponent() public {
        assert(lobby.getGamesBelongingToPlayer().length == 0);
        lobby.createGameWithOpponent(accounts[0]);
        assert(lobby.getGamesBelongingToPlayer().length == 1);
        assert(Battleship(lobby.getGamesBelongingToPlayer()[0]).player1 == msg.sender);
        assert(Battleship(lobby.getGamesBelongingToPlayer()[0]).player2 == accounts[0]);
    }

    function testUserCanJoinOpenGame() public {

    }*/
}