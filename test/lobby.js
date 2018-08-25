const Lobby = artifacts.require("Lobby");
const Battleship = artifacts.require("Battleship");
const catchRevert = require("./exceptions.js").catchRevert;

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

    /*it("should call a function that depends on a linked library", async () => {
        let meta = await MetaCoin.deployed();
        let outCoinBalance = await meta.getBalance.call(accounts[0]);
        let metaCoinBalance = outCoinBalance.toNumber();
        let outCoinBalanceEth = await meta.getBalanceInEth.call(accounts[0]);
        let metaCoinEthBalance = outCoinBalanceEth.toNumber();
        assert.equal(metaCoinEthBalance, 2 * metaCoinBalance);

    });

    it("should send coin correctly", async () => {

        // Get initial balances of first and second account.
        let account_one = accounts[0];
        let account_two = accounts[1];

        let amount = 10;


        let instance = await MetaCoin.deployed();
        let meta = instance;

        let balance = await meta.getBalance.call(account_one);
        let account_one_starting_balance = balance.toNumber();

        balance = await meta.getBalance.call(account_two);
        let account_two_starting_balance = balance.toNumber();
        await meta.sendCoin(account_two, amount, { from: account_one });

        balance = await meta.getBalance.call(account_one);
        let account_one_ending_balance = balance.toNumber();

        balance = await meta.getBalance.call(account_two);
        let account_two_ending_balance = balance.toNumber();

        assert.equal(account_one_ending_balance, account_one_starting_balance - amount, "Amount wasn't correctly taken from the sender");
        assert.equal(account_two_ending_balance, account_two_starting_balance + amount, "Amount wasn't correctly sent to the receiver");
    });*/

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