// npx --yes live-server --host=0.0.0.0 --port=8080
// http://10.0.0.145:8080

const FPS = 30
const MS_PER_FRAME = 1000 / FPS
const SHIM = visualViewport.width / 10
const BALL_RADIUS = visualViewport.width / 20
const FRICTION = .99
const MIN_SPEED = 20
const FLING_DIVISOR = 2
const GOAL_WIDTH = visualViewport.width / 10
const GOAL_HEIGHT = visualViewport.height / 30
const ATHLETE_RADIUS = visualViewport.width / 20
const WALL_WIDTH = visualViewport.width / 10
const CORNER_RADIUS = visualViewport.width / 15
const GREY_COLOR = "grey"
const BLUE_COLOR = "blue"
const RED_COLOR = "red"
const YELLOW_COLOR = "yellow"
const WHITE_COLOR = "white"

let canvas;
let ctx;
let ball = {
	xPos: 0,
	yPos: 0,
	xVel: 0,
	yVel: 0
}
let team = []
let wallPath = []
let wallPaths = []
let touch1 = {
	xPos: 0,
	yPos: 0
}
let isFlingingBall = false
let score = 0
let tries = 0
let perfectScore = 0
let gameLoopTimeout = null

function initializeGame() {
	canvas = document.getElementById("canvas")
	canvas.width = visualViewport.width
	canvas.height = visualViewport.height
	ctx = canvas.getContext('2d')
	document.addEventListener("touchstart", handleTouchstart)
	document.addEventListener("touchmove", handleTouchmove, { passive: false })
	document.addEventListener("touchend", handleTouchend)
	document.addEventListener("wheel", (e) => e.preventDefault(), { passive: false })
	startNewGame()
}

function handleTouchstart(e) {
	touch1.xPos = e.touches[0].clientX
	touch1.yPos = e.touches[0].clientY
	if (isObjectCloseToObject(touch1, SHIM, ball)) {
		isFlingingBall = true
		tries++
	} else {
		wallPath = []
		wallPath.push(
			{
				xPos: touch1.xPos, 
				yPos: touch1.yPos 
			}
		)
	}
}

function handleTouchmove(e) {
	e.preventDefault()
	let touch2 = {
		xPos: e.touches[0].clientX,
		yPos: e.touches[0].clientY
	}
	if (isFlingingBall === true) {
		ball.xVel = (touch2.xPos - touch1.xPos) / FLING_DIVISOR
		ball.yVel = (touch2.yPos - touch1.yPos) / FLING_DIVISOR
	} else {
		wallPath.push(touch2)
	}
}

function handleTouchend() {
	if (isFlingingBall == false) {
		wallPaths.push(wallPath)
	}
}

function startNewGame() {
	if (gameLoopTimeout !== null) {
		clearTimeout(gameLoopTimeout)
		gameLoopTimeout = null
	}
	isFlingingBall = false
	placeBall()
	placeTeam()
	clearWalls()
	loopGame()
}

function placeBall() {
	ball = {
		xPos: randomX(),
		yPos: canvas.height - SHIM,
		xVel: 0,
		yVel: 0
	}
}

function placeTeam() {
	team = []
	for (let i=0; i<5; i++) {
		team.push(
			{
				xPos: randomX(),
				yPos: randomY()
			}
		)
	}
}

function clearWalls() {
	wallPaths = []
}

function loopGame() { // MAIN GAME LOOP
	moveBall()
	handleCollisions()
	draw()
	gameLoopTimeout = setTimeout(loopGame, MS_PER_FRAME)
}

function moveBall() {
	ball.xPos += ball.xVel
	ball.yPos += ball.yVel
	ball.xVel *= FRICTION 
	ball.yVel *= FRICTION
	if (Math.abs(ball.yVel) < MIN_SPEED && Math.abs(ball.xVel) < MIN_SPEED) {
		ball.xVel = 0
		ball.yVel = 0
	}
}

function handleCollisions() {
	handleTeammates()
	handleWalls()
	handleEdges()
}

function handleEdges() {
	if (ball.yPos <=0 || ball.yPos >= canvas.height) {
    ball.yVel = -ball.yVel
  }
  if (ball.xPos <= 0 || ball.xPos >= canvas.width) {
    ball.xVel = -ball.xVel
	}
}

function handleTeammates() {
	for (let i = 0; i < team.length; i++) {
		if (isObjectCloseToObject(ball, SHIM, team[i])) {
			team.splice(i, 1)
			score = score + Math.round(100 / tries)
			perfectScore += 100
			if (team.length == 0) {
				startNewGame()
			}
		}
	}
}

function handleWalls() {
	wallPaths.forEach(path => {
		for (let i = 1; i < path.length - 1; i++) {
			let point = path[i]
			if (isObjectCloseToObject(ball, SHIM, point)) {
				let wallVectorX = path[i++].xPos - path[i--].xPos
				let wallVectorY = path[i++].yPos - path[i--].yPos
				let normalVectorX = -wallVectorY
				let normalVectorY = wallVectorX
				let length = Math.hypot(normalVectorX, normalVectorY)
				normalVectorX /= length
				normalVectorY /= length
				let dot = ball.xVel * normalVectorX + ball.yVel * normalVectorY
				ball.xVel = ball.xVel - 2 * dot * normalVectorX
				ball.yVel = ball.yVel - 2 * dot * normalVectorY
			}
		}
	})
}

function draw() {
	ctx.clearRect(0, 0, canvas.width, canvas.height)
	drawBall()
	drawTeam()
	drawWalls()
	drawScore()
}

function drawBall() {
	ctx.beginPath()
	ctx.arc(ball.xPos, ball.yPos, BALL_RADIUS, 0, 2 * Math.PI)
	ctx.fillStyle = "grey"
	ctx.fill()
}

function drawTeam() {
	for (let i=0; i<team.length; i++) {
		let member = team[i]
		ctx.beginPath()
		ctx.arc(member.xPos, member.yPos, ATHLETE_RADIUS, 0, 2 * Math.PI)
		ctx.fillStyle = "blue"
		ctx.fill()	
	}
}

function drawWalls() {
	ctx.lineWidth = 20
	ctx.strokeStyle = "purple"
	wallPaths.forEach(path => {
		if (path.length < 2) {
			return
		}
		ctx.beginPath()
		ctx.moveTo(path[0].xPos, path[0].yPos)
		path.forEach(point => {
			ctx.lineTo(point.xPos, point.yPos)
		})
		ctx.stroke()
	})
}

function drawScore() {
	ctx.font = "50px Arial"
	ctx.fillStyle = "yellow"
	ctx.fillText(`${score}`, 10, SHIM)
	ctx.font = "25px Arial"
	ctx.fillText(`of ${perfectScore}`, 10, SHIM * 2)
}

function isObjectCloseToObject(objectA, distance, objectB) {
  return (
    Math.abs(objectA.xPos - objectB.xPos) < distance && 
    Math.abs(objectA.yPos - objectB.yPos) < distance
  )
}

function randomX() {
	return visualViewport.width * Math.random()
}

function randomY() {
	return visualViewport.height * Math.random()
}