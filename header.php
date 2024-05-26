<?php require_once(realpath($_SERVER["DOCUMENT_ROOT"]).'/pcl_computers/model/database_pcl.php');

// Start persistent 2 week session
$lifetime = 60 * 60 * 24 * 14;
session_set_cookie_params($lifetime, '/');
session_start();

// Check if user is logged in
if (isset($_SESSION['userID'])) {
	// Get user type
	$queryUser = 'SELECT * FROM users WHERE userID = '.$_SESSION['userID'];
	$statement = $db->prepare($queryUser);
	$statement->execute();
	$user = $statement->fetch();
	$statement->closeCursor();
	$userType = $user['userType'];
	$userName = $user['firstName'].' '.$user['lastName'];
} else $userType = 'guest';

?>

<!DOCTYPE html>
<html lang="en">

<head>
	<meta charset="utf-8">
	<title>PCL Computers</title>
	<link rel="shortcut icon" href="/pcl_computers/images/pcl_favicon.ico">
	<link rel="stylesheet" type="text/css" href="/pcl_computers/styles/main.css">

	<script src="https://ajax.googleapis.com/ajax/libs/jquery/3.6.3/jquery.min.js" type="text/javascript"></script>

	<script type="text/javascript">
		$(function() {
			var url = window.location.href;
			$("header nav a").each(function() {
				if (url.includes(this.href)) {
					$(this).addClass("active");
				}
			});
		});
	</script>

	<script type="text/javascript">
		$(function() {
			$("#carticon").click(function() {
				$("#cart").toggle();
				$("section").toggleClass("width")
			});
		});
	</script>

	<script type="text/javascript">
		function toggleClass(element) {
			element.parentNode.classList.toggle("showhide");
		}
	</script>

</head>

<body>
	<header>
		<div id="home">
			<a href="/pcl_computers"><img src="/pcl_computers/images/pcl_logo.png" alt="PCL Logo (Home)"></a>
			<a href="/pcl_computers"><h1>Computers</h1></a>
		</div>
		<div id="homehint">
			<p id="hometext">Home</p>
			<p id="homearrow">&#8592;&#8212;&#8212;&#8212;&#8212;</p>
		</div>
		<nav>
			<ul>
				<li><a href="/pcl_computers/explore">Explore</a></li>
				<li><a href="/pcl_computers/parts">PC Parts</a>
					<ul id="parts" class="double">
						<li class="dbr"><a><br></a></li>
						<li><a href="/pcl_computers/parts?category=1">Processors (CPUs)</a></li>
						<li><a href="/pcl_computers/parts?category=2">CPU Coolers</a></li>
						<li><a href="/pcl_computers/parts?category=3">Motherboards</a></li>
						<li><a href="/pcl_computers/parts?category=4">Memory (RAM)</a></li>
						<li><a href="/pcl_computers/parts?category=5">Storage</a></li>
						<li><a href="/pcl_computers/parts?category=6">Video Cards (GPUs)</a></li>
						<li><a href="/pcl_computers/parts?category=7">Cases</a></li>
						<li><a href="/pcl_computers/parts?category=8">Power Supplies</a></li>
						<li><a href="/pcl_computers/parts?category=9">Fans</a></li>
						<li><a href="/pcl_computers/parts?category=10">Other Parts</a></li>
					</ul>
				</li>
				<li><a href="/pcl_computers/<?php if ($userType == 'guest') echo 'account/login'; else echo 'builder'; ?>">PC Builder</a></li>
				<li><a href="/pcl_computers/compare">Compare</a></li>
				<li><a class="last" href="<?php if ($userType == 'guest')
					echo '#'; else echo '/pcl_computers/account'; ?>">Account</a>
					<ul id="account">
						<li><a class="br"><br></a></li>
						<?php if ($userType == 'tech') echo '<li><a href="/pcl_computers/account/admin">Admin Menu</a></li>';
						if ($userType == 'guest') {
							echo '<li><a href="/pcl_computers/account/signup">Sign Up</a></li>';
							echo '<li><a href="/pcl_computers/account/login">Log In</a></li>';
						} else {
							echo '<li><a href="/pcl_computers/account/orders">Orders</a></li>';
							echo '<li><a href="/pcl_computers/account/inquiries">Support</a></li>';
							echo '<li><a href="/pcl_computers/account/logout.php">Log Out</a></li>';
						} ?>
					</ul>
				</li>
			</ul>
		</nav>
		<div id="homehint">
			<p id="hometext">Home</p>
			<p id="homearrow">&#8592;&#8212;&#8212;&#8212;&#8212;</p>
		</div>
		<div id="user">
			<?php if ($userType == 'guest') {
				echo '<a href="/pcl_computers/account/signup">Sign Up</a>';
				echo '<p>or</p>';
				echo '<a href="/pcl_computers/account/login">Log In</a>';
			} else {
				echo '<a id="carticon" href="#"><img src="/pcl_computers/images/cart.png"></a>';
				echo '<span id="username">Logged in as';
				if ($userType == 'tech') echo ' <b> Technician</b> ';
				echo '<br><b><u>'.$userName.'</u></b></span>';
			} ?>
		</div>
	</header>