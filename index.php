<?php include 'global/header.php';
?>
<main>

	<section class="welcome">
		<img src="images/pcl_logo.png" height="192px">
		<h1 style="font-size: 300%;">Welcome to PCL Computers!</h1>
		<p>Here at PCL Computers, we strive to provide you with the best possible PC building experience.<br>
		We have a wide range of parts and accessories to choose from, and our easy to use builder will help you create your dream PC.</p>
	</section>

	<section class="home">
		<h1><a href="explore">Explore</a></h1>
		<p>Have a look at a beautiful PC and explore its various parts.<br>Click anywhere on the picture to bring up additional details.</p>
		<a href="explore"><img src="images/pc.png" height="384px"></a>
	</section>

	<section class="home">
		<h1><a href="builder">Build your own PC</a></h1>
		<p>Build your own PC with our easy to use builder.<br>Choose from a wide range of parts and accessories.</p>
		<figure class="video">
			<iframe class="video" width="560px" height="315px" src="https://www.youtube.com/embed/BL4DCEp7blY" title="YouTube video player" frameborder="0"
			allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe>
			<figcaption class="video">A comprehensive guide to building your own PC<br>(Video from Linus Tech Tips)</figcaption>
		</figure>
	</section>

	<section class="home">
		<h1><a href="parts">Browse Parts</a></h1>
		<p>Have a look at our wide range of parts and accessories.</p>
	</section>

	<section class="home">
		<h1><a href="compare">Compare</a></h1>
		<p>Compare up to three parts side by side to make the best choice.</p>

	<?php if ($userType != 'guest') {
		echo '<section id="cart">';
		include 'cart/cart.php';
		echo '</section>';
	} ?>

</main>

<?php include 'global/footer.php'; ?>