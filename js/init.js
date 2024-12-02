//Hook up the tweet display

$(document).ready(function() {
						   
	$(".countdown").countdown({
				date: "30 jun 2024 16:20:00",
				format: "on"
			},
			
			function() {
				// callback function
			});

});	
