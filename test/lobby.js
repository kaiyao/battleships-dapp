const Lobby = artifacts.require("Lobby");
const Battleship = artifacts.require("Battleship");
const catchRevert = require("./exceptions.js").catchRevert;

const GAMESTATE_CREATED = 0;
const GAMESTATE_PLAYERSJOINED = 1;
const GAMESTATE_STARTED = 2;
const GAMESTATE_FINISHED = 3;
const GAMESTATE_SHIPSREVEALED = 4;
const GAMESTATE_ENDED = 5;

const GameEndState_Unknown = 0;
const GameEndState_Draw = 1;
const GameEndState_Player1WinsValidGame = 2;
const GameEndState_Player2WinsValidGame = 3; 
const GameEndState_Player1WinsInvalidGame = 4;
const GameEndState_Player2WinsInvalidGame = 5;

contract('Lobby open games', async (accounts) => {

    const owner = accounts[0];
    const alice = accounts[1];
    const bob = accounts[2];
    const emptyAddress = '0x0000000000000000000000000000000000000000';

    it("should be able to create new open game", async () => {
        let instance = await Lobby.deployed();
        
        let games = await instance.getGamesBelongingToPlayer({from: alice});
        assert.equal(games.length, 0, "list of games should be empty at the start");
        
        await instance.createOpenGame(0, {from: alice});
        
        games = await instance.getGamesBelongingToPlayer({from: alice});
        //console.log(games);
        assert.equal(games.length, 1, "list of games should have one game after creating new game");

        openGames = await instance.getOpenGames();
        assert.equal(openGames.length, 1, "open games should have one game after creating new game");

        assert.equal(games[0], openGames[0], "game in alice and open game should have same address");
        
        // https://ethereum.stackexchange.com/questions/42676/truffle-contract-factory-testing-javascript
        let game = await Battleship.at(games[0]);
        //console.log(game);
        //console.log(await game.player1());
        //console.log(await game.player2());

        assert(await game.player1() == alice, "first player should be the player who executed the create open game function");
        assert(await game.player2() == emptyAddress, "second player should be empty as it is an open game");
    });

    it("should be able to join open game", async () => {
        let instance = await Lobby.deployed();
        
        let playerGames = await instance.getGamesBelongingToPlayer({from: bob});
        assert.equal(playerGames.length, 0, "list of games should be empty at the start");
        
        let openGames = await instance.getOpenGames({from: bob});
        assert.equal(openGames.length, 1, "list of open games should have one game to join");

        const openGameIndex = 0;
        await instance.joinOpenGame(openGameIndex, {from: bob});

        playerGames = await instance.getGamesBelongingToPlayer({from: bob});
        //console.log(playerGames);
        assert.equal(playerGames.length, 1, "list of games should have one game after joining game");

        gameAddress = playerGames[0];

        openGames = await instance.getOpenGames({from: bob});
        assert.equal(openGames[openGameIndex], 0, "open game should be removed from open games list");

        let game = await Battleship.at(gameAddress);
        assert(await game.player1() == alice, "first player should be alice");
        assert(await game.player2() == bob, "second player should be bob");
    });

});


contract('Lobby non-open games', async (accounts) => {

    const owner = accounts[0];
    const alice = accounts[1];
    const bob = accounts[2];
    const emptyAddress = '0x0000000000000000000000000000000000000000';

    it("should be able to create new non-open game", async () => {
        let instance = await Lobby.deployed();
        
        let games = await instance.getGamesBelongingToPlayer({from: alice});
        assert.equal(games.length, 0, "list of games should be empty at the start");
        
        await instance.createGameWithOpponent(bob, 0, {from: alice});
        
        games = await instance.getGamesBelongingToPlayer({from: alice});
        assert.equal(games.length, 1, "list of games should have one game after creating new game");

        openGames = await instance.getOpenGames();
        assert.equal(openGames.length, 0, "open games should have zero games after creating non-open game");

        games2 = await instance.getGamesBelongingToPlayer({from: bob});
        assert.equal(games[0], games2[0], "game in alice and bob should have same address");
        
        let game = await Battleship.at(games[0]);

        assert(await game.player1() == alice, "first player should be alice");
        assert(await game.player2() == bob, "second player should be bob");
    });

});

contract('Lobby test add two same players', async (accounts) => {

    const owner = accounts[0];
    const alice = accounts[1];
    const bob = accounts[2];
    const emptyAddress = '0x0000000000000000000000000000000000000000';

    it("should not be allowed to create game with opponent being the same player as caller", async () => {
        let instance = await Lobby.deployed();
        
        let games = await instance.getGamesBelongingToPlayer({from: alice});
        assert.equal(games.length, 0, "list of games should be empty at the start");
        
        await catchRevert(instance.createGameWithOpponent(alice, 0, {from: alice}));
    });

    it("should not be allowed to join game with same player as first player", async () => {
        let instance = await Lobby.deployed();
        
        let games = await instance.getGamesBelongingToPlayer({from: alice});
        assert.equal(games.length, 0, "list of games should be empty at the start");

        await instance.createOpenGame(0, {from: alice});

        const openGameIndex = 0;
        await catchRevert(instance.joinOpenGame(openGameIndex, {from: alice}));
    });

});

contract('Lobby test stopping and destroying', async (accounts) => {

    const owner = accounts[0];
    const alice = accounts[1];
    const bob = accounts[2];
    const emptyAddress = '0x0000000000000000000000000000000000000000';

    it("should only be allowed to stop/destroy games from Lobby", async () => {
        let instance = await Lobby.deployed();
        
        let games = await instance.getGamesBelongingToPlayer({from: alice});
        assert.equal(games.length, 0, "list of games should be empty at the start");
        
        await instance.createGameWithOpponent(bob, 0, {from: alice});
        games = await instance.getGamesBelongingToPlayer({from: alice});
        assert.equal(games.length, 1, "list of games should have one game");

        let gameAddress = games[0];
        let game = await Battleship.at(gameAddress);
        assert.equal(await game.gameState(), GAMESTATE_PLAYERSJOINED, "Game should have been created and players joined");

        await catchRevert(game.emergencyStop({from: owner})); // should not be allowed to emergency stop as the lobby is the owner
        await catchRevert(game.emergencyStop({from: alice})); // should not be allowed to emergency stop as the lobby is the owner
        await catchRevert(game.emergencyStop({from: bob})); // should not be allowed to emergency stop as the lobby is the owner

        await catchRevert(instance.emergencyStopGame(gameAddress, {from: alice})); // only owner of lobby can call
        await catchRevert(instance.emergencyStopGame(gameAddress, {from: bob})); // only owner of lobby can call
        assert.equal(await game.gameState(), GAMESTATE_PLAYERSJOINED, "Game should NOT have ended");

        await instance.emergencyStopGame(gameAddress);
        assert.equal(await game.gameState(), GAMESTATE_ENDED, "Game should be ended");

        await catchRevert(game.destroy({from: owner})); // should not be allowed to destroy
        await catchRevert(game.destroy({from: alice})); // should not be allowed to destroy
        await catchRevert(game.destroy({from: bob})); // should not be allowed to destroy
        assert.equal(await game.gameState(), GAMESTATE_ENDED, "Game should be ended 2");

        await catchRevert(instance.destroyGame(gameAddress, {from: alice})); // only owner of lobby can call
        await catchRevert(instance.destroyGame(gameAddress, {from: bob})); // only owner of lobby can call
        assert.equal(await game.gameState(), GAMESTATE_ENDED, "Game should be ended 3");

        await instance.destroyGame(gameAddress);
        // ensure address no longer a contract
        try {
            await game.gameState();
            throw null;
        }
        catch (error) {
            assert(error, "Expected an error but did not get one");
            let expectedErrorMessageStartsWith = "Attempting to run transaction which calls a contract function, but recipient address";
            let expectedErrorMessageEndsWith = "is not a contract address";
            assert(error.message.startsWith(expectedErrorMessageStartsWith), "Expected an error starting with '" + expectedErrorMessageStartsWith + "' but got '" + error.message + "' instead");
            assert(error.message.endsWith(expectedErrorMessageEndsWith), "Expected an error ending with '" + expectedErrorMessageEndsWith + "' but got '" + error.message + "' instead");
        }
    });

});