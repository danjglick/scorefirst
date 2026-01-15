// npx --yes live-server --host=0.0.0.0 --port=8080
// http://10.0.0.145:8080

const FPS = 30
const MS_PER_FRAME = 1000 / FPS
const SHIM = visualViewport.width / 10
const GREY_COLOR = "grey"
const BLUE_COLOR = "blue"
const RED_COLOR = "red"
const YELLOW_COLOR = "yellow"
const WHITE_COLOR = "white"
const BALL_RADIUS = visualViewport.width / 20
const FRICTION = .99
const MIN_SPEED = 10
const FLING_DIVISOR = 2
const ATHLETE_RADIUS = visualViewport.width / 20
const GOAL_WIDTH = visualViewport.width / 10
const GOAL_HEIGHT = visualViewport.height / 30
const WALL_WIDTH = visualViewport.width / 10

let canvas;
let ctx;
let ball = {
	xPos: 0,
	yPos: 0,
	xVel: 0,
	yVel: 0
}
let team = []
let goal = {}
let walls = []
let touch1 = {
	xPos: 0,
	yPos: 0
}
let isUserFlingingBall = false

function initializeGame() {
	canvas = document.getElementById("canvas")
	canvas.width = visualViewport.width
	canvas.height = visualViewport.height
	ctx = canvas.getContext('2d')
	document.addEventListener("touchstart", handleTouchstart)
	document.addEventListener("touchmove", handleTouchmove, { passive: false })
	startGame()
}

function handleTouchstart(e) {
	touch1.xPos = e.touches[0].clientX
	touch1.yPos = e.touches[0].clientY
	if (isObjectCloseToObject(touch1, SHIM, ball)) {
		isUserFlingingBall = true
	}
}

function handleTouchmove(e) {
	e.preventDefault()
	let touch2 = {
		xPos: e.touches[0].clientX,
		yPos: e.touches[0].clientY
	}
	if (isUserFlingingBall == true) {
		ball.xVel = (touch2.xPos - touch1.xPos) / FLING_DIVISOR
		ball.yVel = (touch2.yPos - touch1.yPos) / FLING_DIVISOR
	}
}

function startGame() {
	placeBall()
	placeTeam()
	placeGoal()
	loopGame()
}

function placeBall() {
	ball.xPos = randomX()
	ball.yPos = canvas.height - SHIM
}

function placeTeam() {
	for (let i=0; i<5; i++) {
		team.push(
			{
				xPos: randomX(),
				yPos: randomY()
			}
		)
	}
}

function placeGoal() {
	let edgeSpots = []
	let spot = {
		xPos: 0,
		yPos: 0
	}
	while (spot.xPos < canvas.width) {
		edgeSpots.push(spot)
		spot = {
			xPos: spot.xPos += 1,
			yPos: spot.yPos
		}
	}
	spot = {
		xPos: canvas.width - GOAL_WIDTH,
		yPos: 0
	}
	while (spot.yPos < canvas.height) {
		edgeSpots.push(spot)
		spot = {
			xPos: spot.xPos,
			yPos: spot.yPos += 1
		}
	}
	spot = {
		xPos: canvas.width - GOAL_WIDTH,
		yPos: canvas.height - GOAL_HEIGHT
	}
	while (spot.xPos > 0) {
		edgeSpots.push(spot)
		spot = {
			xPos: spot.xPos -= 1,
			yPos: spot.yPos
		}
	}
	spot = {
		xPos: 0,
		yPos: canvas.height - GOAL_HEIGHT
	}
	while (spot.yPos > 0) {
		edgeSpots.push(spot)
		spot = {
			xPos: spot.xPos,
			yPos: spot.yPos -= 1
		}
	}
	let randomSpot = edgeSpots[Math.floor(Math.random() * edgeSpots.length)]
	goal.xPos = randomSpot.xPos
	goal.yPos = randomSpot.yPos
}

function loopGame() { // MAIN GAME LOOP
	moveBall()
	handleCollisions()
	draw()
	setTimeout(loopGame, MS_PER_FRAME)
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
	if (ball.yPos <=0 || ball.yPos >= canvas.height) {
		ball.yVel = -ball.yVel
	}
	if (ball.xPos <= 0 || ball.xPos >= canvas.width) {
		ball.xVel = -ball.xVel
	}
}

function draw() {
	ctx.clearRect(0, 0, canvas.width, canvas.height)
	drawBall()
	drawTeam()
	drawGoal()
}

function drawBall() {
	ctx.beginPath()
	ctx.arc(ball.xPos, ball.yPos, BALL_RADIUS, 0, 2 * Math.PI)
	ctx.fillStyle = GREY_COLOR
	ctx.fill()
}

function drawGoal() {
	ctx.fillStyle = "brown"
	ctx.fillRect(goal.xPos, goal.yPos, GOAL_WIDTH, GOAL_HEIGHT)
}

function drawTeam() {
	for (let i=0; i<team.length; i++) {
		let member = team[i]
		ctx.beginPath()
		ctx.arc(member.xPos, member.yPos, ATHLETE_RADIUS, 0, 2 * Math.PI)
		ctx.fillStyle = BLUE_COLOR
		ctx.fill()	
	}
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