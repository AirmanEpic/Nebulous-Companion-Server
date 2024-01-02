const express = require('express');
var app = express();
var app80 = express();
var fs = require('fs');
const http2 = require('http');
let cors = require('cors')
var bodyParser = require('body-parser')
//axios
const axios = require('axios');

app.use(bodyParser.urlencoded({extended:true}));
app.use(bodyParser.json());

const app3000 = express();
const server3000 = http2.createServer(app3000);

const socketIO = require("socket.io");

app80.use(bodyParser.urlencoded({extended:true}));
app80.use(bodyParser.json());

var http = require('http').Server(app);
server5000 = app.listen(5000,()=>{
	console.log("started on port 5000")
})

server3000.listen(3000, () => {
    console.log(`Server started on port 3000 :)`);
    // initMouse();
})


const io = socketIO(server3000,{
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }

});

//start a server on port 80
server80 = app80.listen(80,()=>{
    console.log("started on port 80")
})
app.use(cors())
app3000.use(cors())

app80.use(cors())

/*

    Midshipman (MID) - 0 XP
    Ensign (ENS) - 100 XP
    Lieutenant Junior Grade (LTJG) - 500 XP
    Lieutenant (LT) - 1200 XP
    Lieutenant Commander (LCDR) - 3000 XP
    Commander (CMDR) - 6500 XP
    Captain (CAPT) - 10000
    Commodore (CDRE) - 18000

*/

let status={
    state:"lobby",
    map:"Pillars",
    playercount:0,
    playerDisposition:{top:0,bot:0,spec:0},
    inStateSince:0,
}

ranks = [
    {name:"Midshipman",xp:0},
    {name:"Ensign",xp:100},
    {name:"Lieutenant Junior Grade",xp:500},
    {name:"Lieutenant",xp:1200},
    {name:"Lieutenant Commander",xp:3000},
    {name:"Commander",xp:6500},
    {name:"Captain",xp:10000},
    {name:"Commodore",xp:18000}
]

const unbalancedThreshold = 3;

app.post("/startLobby",function(req, res){
    console.log("startLobby")
    updateServerStatus("lobby", req.body.map, 0, {top:0,bot:0,spec:0})
    res.send({result:true, message:"Lobby started."})
})

app.post("/changePlayer",function(req, res){
    console.log("changePlayer")
    console.log(req.body)
    let playercount = req.body.playerCount
    let playerDisposition = req.body.playerDisposition
    updateServerStatus("lobby", status.map, playercount, playerDisposition)
    console.log(status)
    res.send({result:true, message:"Player count updated."})
})

app.post("/changeMap",function(req, res){
    console.log("changeMap")
    updateServerStatus("lobby", req.body.map, status.playercount, status.playerDisposition)
    res.send({result:true, message:"Map updated."})
})

app.post("/startGame",function(req, res){
    console.log("startGame")
    updateServerStatus("playing", status.map, status.playercount, status.playerDisposition)
})

app80.get("/getStatus",function(req, res){
    console.log("getStatus")
    res.send(status)
})
let serverdata = {}

setInterval(()=>{
    updateServerData()
}, 30000)

function updateServerData(){
    console.log("updateServerData")
    axios.get('https://api.steampowered.com/IGameServersService/GetServerList/v1/?key=A96B85AE8E6A3E52C726563D902C2B77&filter=appid\\887570')
    .then((response)=>{
        console.log(response.data)
        serverdata = response.data
    })
}

updateServerData()

app80.get("/allservers",function(req, res){
    console.log("allservers")
    //https://api.steampowered.com/IGameServersService/GetServerList/v1/?key=A96B85AE8E6A3E52C726563D902C2B77&filter=appid\887570

    //just respond with the data from this url
    //https://api.steampowered.com/IGameServersService/GetServerList/v1/?key=A96B85AE8E6A3E52C726563D902C2B77&filter=appid\887570

    //make a request to the steam api

    res.send(serverdata)
})

app80.get("/needsplayers/:addr",function(req, res){
    console.log("needsplayers")
    //manually add a flag to the server data
    let addr = req.params.addr
    serverdata.response.servers.forEach((element)=>{
        if (element.addr == addr){
            element.needsplayers = true
        }
    })
    
    //set a timeout to remove the flag
    setTimeout(()=>{
        serverdata.response.servers.forEach((element)=>{
            if (element.addr == addr){
                element.needsplayers = false
            }
        })
    }, 30000)
})

function getDelta(score){
    //return a string that shows how many poings a team has advantage
    //negative means that the top team is winning
    let scoreString = ""
    if (score > 0){
        scoreString = " T1 has a " + score + " stripe advantage"
    }
    else{
        scoreString = " T2 has a " + Math.abs(score) + " stripe advantage"
    }

    if (score < unbalancedThreshold){
        return scoreString + ", which is 'close enough'."
    }

    return scoreString
        
}

app.post("/playerRanks",function(req, res){
    console.log("playerRanks")
    //get the data from the request
    var data = req.body
    console.log(data)
    // if (data.length%2 != 0){
    //     res.send({result:false, message:"There must be an even number of players."})
    // }
    

    let playerRanks = getPlayerRanks(data)
    console.log(playerRanks)
    let scores = scoreSides(playerRanks)

    console.log(scores)
    if (scores > unbalancedThreshold){
        //generate the iterations
        let iterations = generateIterations(playerRanks)
        //score iterations
        let iterationScores = []
        iterations.forEach((element)=>{
            iterationScores.push(scoreIteration(element))
        })
        //find the lowest score
        let lowestScore = 10000
        let lowestIndex = 0
        iterationScores.forEach((element, index)=>{
            if (element < lowestScore){
                lowestScore = element
                lowestIndex = index
            }
        })

        //if the lowest score is greater than 6, the sides are unbalanced but there's nothing that can be done.
        if (lowestScore > unbalancedThreshold){
            console.log("Sides unbalanced but no better way to balance them. " + lowestScore)
            res.send({result:true, message:"Sides unbalanced but no better way to balance them."})
            return
        }

        //translate the lowest score to plain english
        let bestIteration = iterations[lowestIndex]
        let bestIterationString = "Sides are stacked! The best way to balance the sides is to have "
        // bestIteration.top.forEach((element)=>{
        //     bestIterationString += element.player + ", "
        // })
        // bestIterationString = bestIterationString.substring(0, bestIterationString.length-2)
        // bestIterationString += " on one side and "
        // bestIteration.bot.forEach((element)=>{
        //     bestIterationString += element.player + ", "
        // })
        // bestIterationString = bestIterationString.substring(0, bestIterationString.length-2)
        // bestIterationString += " on the other side."
        
        //go through the original sides. 
        console.log("Best Iteration: ",bestIteration)
        let needToMove = getNeedToMove(bestIteration)
        
        bestIterationString += needToMove.join(", ") + " switch to the other side."


        res.send({result:false, message:bestIterationString})
        return
    }
    res.send({result:true, message:"Airman says hi"})
})

app.post("/getMessage", function(req, res){
    //a brief message about what the server is and how it works.
})

app.post("/RequestAutoBalance", function(req, res){
    console.log("RequestAutoBalance")
    //get the data from the request
    var data = req.body

    let playerRanks = getPlayerRanks(data)
    console.log(playerRanks)
    let scores = scoreSides(playerRanks)
    if (scores <= unbalancedThreshold){
        res.send({result:false, message:"Sides are balanced." + getDelta(scoreSidesDelta(playerRanks)), map:""})
        return
    }

    let iterations = generateIterations(playerRanks)
    //score iterations
    let iterationScores = []
    iterations.forEach((element)=>{
        iterationScores.push(scoreIteration(element))
    })
    //find the lowest score
    let lowestScore = 10000
    let lowestIndex = 0
    iterationScores.forEach((element, index)=>{
        if (element < lowestScore){
            lowestScore = element
            lowestIndex = index
        }
    })

    //if the lowest score is greater than 6, the sides are unbalanced but there's nothing that can be done.
    if (lowestScore > unbalancedThreshold){
        console.log("Sides unbalanced but no better way to balance them. " + getDelta(scoreSidesDelta(playerRanks)))
        res.send({result:false, message:"Sides unbalanced but no better way to balance them.", map:""})
        // res.send({result:true,message:"Airman is getting swapped to demo", map:"AirmanEpic"})
        // return
    }

    let bestIteration = iterations[lowestIndex]
    let needToMove = getNeedToMove(bestIteration)
    console.log("needtomove: ", needToMove)

    res.send({result:true, message:"Not balanced. One potential way to balance teams: players "+needToMove.join(", ")+" should move."+ getDelta(scoreSidesDelta(playerRanks)), map:""})
})

function getPlayerRanks(data){
    let playerRanks = []
    data.forEach((element, index) => {
        //get the player's rank
        let playerRank = getPlayerRank(element)
        if (element.side != "None"){
            playerRanks.push({player:element.name, rank:playerRank,side:element.side=="TeamA"?"top":"bot"})
        }
    });

    return playerRanks
}

function scoreSides(playerRanks){
    let top = 0
    let bot = 0
    playerRanks.forEach(element => {
        if(element.side == "top"){
            top += element.rank
        }else{
            bot += element.rank
        }
    });

    return Math.abs(top-bot)
}

function scoreSidesDelta(playerRanks){
    let top = 0
    let bot = 0
    playerRanks.forEach(element => {
        if(element.side == "top"){
            top += element.rank
        }else{
            bot += element.rank
        }
    });
    //negative indicates that the top side is winning
    return top-bot

}

function updateServerStatus(
    state,
    map,
    playercount,
    playerDisposition,
){
    status.state = state
    status.map = map
    status.playercount = playercount
    status.playerDisposition = playerDisposition
    status.inStateSince = Date.now()
}

function getPlayerRank(player){
    let selectedRank = 0
    ranks.forEach((rank, index) => {
        if(player.rank > rank.xp){
            selectedRank = index
            return 
        }
    })
    return selectedRank
}

function generateIterations(players){
    iterations = []
    //the parameter "top" and "bot" are the sides of players.
    //generate every possible combination of equal players on each side
    count = players.length
    let currentStrings = [""]
    for (let i=0; i<count; i++){
        let csl = currentStrings.length
        workingCS = JSON.parse(JSON.stringify(currentStrings))
        newBlank = []
        for (let j=0; j<csl; j++){
            thisCS = workingCS[j]
            newBlank.push(thisCS+"t")
            newBlank.push(thisCS+"b")
        }
        currentStrings = newBlank
    }

    //filter out the strings that don't have the same number of players on each side
    currentStrings = currentStrings.filter((element)=>{
        let top = 0
        let bot = 0
        for (let i=0; i<element.length; i++){
            if (element[i] == "t"){
                top++
            }else{
                bot++
            }
        }
        return Math.abs(top-bot) < 2
    })

    console.log("Side options: ",currentStrings)

    //convert the strings into arrays of players
    currentStrings.forEach((element)=>{
        let top = []
        let bot = []
        for (let i=0; i<element.length; i++){
            if (element[i] == "t"){
                top.push(players[i])
            }else{
                bot.push(players[i])
            }
        }
        iterations.push({top:top, bot:bot})
    })
    
    return iterations
}

function scoreIteration(it){
    //score the iteration
    let top = 0
    let bot = 0
    it.top.forEach((element)=>{
        top += element.rank
    })
    it.bot.forEach((element)=>{
        bot += element.rank
    })

    return Math.abs(top-bot)+((getNeedToMove(it).length-2)/4)
}

function getNeedToMove(iteration){
    ntm = []
    console.log("iteration: ",iteration)
    iteration.top.forEach((element)=>{
        //if "top" and "TeamB" or "bot" and "TeamA", then they need to be moved
        if (element.side == "bot" || element.side == "TeamB"){
            ntm.push(element.player)
        }
    })

    iteration.bot.forEach((element)=>{
        //if "top" and "TeamB" or "bot" and "TeamA", then they need to be moved
        if (element.side == "top" || element.side == "TeamA"){
            ntm.push(element.player)
        }
    })

    return ntm
}

io.on('connection',(socket) => {
    console.log('a user connected');
    socket.on('disconnect', () => {
        console.log("user disconnected")
    })
});