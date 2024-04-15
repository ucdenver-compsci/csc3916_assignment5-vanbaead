/*
CSC3916 HW2
File: Server.js
Description: Web API scaffolding for Movie API
 */

var express = require('express');
var bodyParser = require('body-parser');
var passport = require('passport');
var authController = require('./auth');
var authJwtController = require('./auth_jwt');
var jwt = require('jsonwebtoken');
var cors = require('cors');
var User = require('./Users');
var Movie = require('./Movies');
var Review = require('./Reviews');

var app = express();
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));

app.use(passport.initialize());

var router = express.Router();

function getJSONObjectForMovieRequirement(req) {
    var json = {
        headers: "No headers",
        key: process.env.UNIQUE_KEY,
        body: "No body"
    };

    if (req.body != null) {
        json.body = req.body;
    }

    if (req.headers != null) {
        json.headers = req.headers;
    }

    return json;
}

router.post('/signup', function(req, res) {
    if (!req.body.username || !req.body.password) {
        res.json({success: false, msg: 'Please include both username and password to signup.'})
    } else {
        var user = new User();
        user.name = req.body.name;
        user.username = req.body.username;
        user.password = req.body.password;

        user.save(function(err){
            if (err) {
                if (err.code == 11000)
                    return res.json({ success: false, message: 'A user with that username already exists.'});
                else
                    return res.json(err);
            }

            res.json({success: true, msg: 'Successfully created new user.'})
        });
    }
});

router.post('/signin', function (req, res) {
    var userNew = new User();
    userNew.username = req.body.username;
    userNew.password = req.body.password;

    User.findOne({ username: userNew.username }).select('name username password').exec(function(err, user) {
        if (err) {
            res.send(err);
        }
        
        user.comparePassword(userNew.password, function(isMatch) {
            if (isMatch) {
                var userToken = { id: user.id, username: user.username };
                var token = jwt.sign(userToken, process.env.SECRET_KEY);
                res.json ({success: true, token: 'JWT ' + token});
            }
            else {
                res.status(401).send({success: false, msg: 'Authentication failed.'});
            }
        })
    })
});

router.route('/movies')
    .get(authJwtController.isAuthenticated, (req, res) => {
        const { reviews } = req.query;

        if (reviews === 'true') {
            Movie.aggregate([
                {
                    $lookup: {
                        from: 'reviews',
                        localField: '_id',
                        foreignField: 'movieId',
                        as: 'reviews'
                    }
                },
                {
                    $addFields: {
                        avgRating: { $avg: '$reviews.rating' }
                    }
                },
                {
                    $sort: { avgRating: -1 }
                }
            ])
            .then(moviesWithReviews => {
                res.json(moviesWithReviews);
            })
            .catch(err => {
                console.error('Error aggregating reviews and movies:', err);
                res.status(500).json({ error: 'Internal server error' });
            })
        }
        else{
            //Fetch all movies from the database
            Movie.find()
                .then(movies => {
                    res.json(movies);
                })
                .catch(err => {
                    console.error('Error fetching movies:', err);
                    res.status(500).json({ error: 'Internal server error' });
                });
        }
    })
    //Route to create a new movie or return all movies
    .post(authJwtController.isAuthenticated, (req, res) => {
        //Extract movie data from the request body
        const { title, releaseDate, genre, actors, imageUrl } = req.body;

        //Create a new movie document
        const newMovie = new Movie({
            title,
            releaseDate,
            genre,
            actors,
            imageUrl
        });

        //Save the new movie to the database
        newMovie.save()
            .then(() => {
                //After saving the new movie, fetch all movies from the database
                return Movie.find();
            })
            .then(movies => {
                res.json(movies); //Respond with all movies
            })
            .catch(err => {
                console.error('Error creating movie:', err);
                res.status(500).json({ error: 'Internal server error' });
            });
    })
    .all((req, res) => {
        // Any other HTTP Method
        // Returns a message stating that the HTTP method is unsupported.
        res.status(405).send({ message: 'HTTP method not supported.' });
    });

router.route('/movies/:title')
    .get(authJwtController.isAuthenticated, (req, res) => {
        const title = req.params.title;
        const { reviews } = req.query;

        if (reviews === 'true') {
            Movie.aggregate([
                {
                    $match: { title }
                },
                {
                    $lookup: {
                        from: 'reviews',
                        localField: '_id',
                        foreignField: 'movieId',
                        as: 'reviews'
                    }
                },
                {
                    $addFields: {
                        avgRating: { $avg: '$reviews.rating' }
                    }
                }
            ])
            .then(movieWithReview => {
                if (movieWithReview.length === 0) {
                    return res.status(404).json({ error: 'Movie not found' });
                }
                else {
                    res.json(movieWithReview);
                }
            })
            .catch(err => {
                console.error('Error aggregating reviews and movies:', err);
                res.status(500).json({ error: 'Internal server error' });
            })
        }
        else {
            Movie.findOne({ title })
                .then(movie => {
                    if (!movie) {
                        return res.status(404).json({ error: 'Movie not found' });
                    }
                    res.json(movie);
                })
                .catch(err => {
                    console.error('Error fetching movie:', err);
                    res.status(500).json({ error: 'Internal server error' });
                });
        }
    })
    .put(authJwtController.isAuthenticated, (req, res) => {
        const title = req.params.title;
        const { releaseDate, genre, actors, imageUrl } = req.body;
    
        Movie.findOneAndUpdate({ title }, { releaseDate, genre, actors, imageUrl }, { new: true })
            .then(movie => {
                if (!movie) {
                    return res.status(404).json({ error: 'Movie not found' });
                }
                res.json(movie);
            })
            .catch(err => {
                console.error('Error updating movie:', err);
                res.status(500).json({ error: 'Internal server error' });
            });
    })
    .delete(authJwtController.isAuthenticated, (req, res) => {
        const title = req.params.title;
    
        Movie.findOneAndDelete({ title })
            .then(movie => {
                if (!movie) {
                    return res.status(404).json({ error: 'Movie not found' });
                }
                res.json({ message: 'Movie deleted successfully' });
            })
            .catch(err => {
                console.error('Error deleting movie:', err);
                res.status(500).json({ error: 'Internal server error' });
            });
    })
    .all((req, res) => {
        // Any other HTTP Method
        // Returns a message stating that the HTTP method is unsupported.
        res.status(405).send({ message: 'HTTP method not supported.' });
    });

router.route('/reviews')
    .get(authJwtController.isAuthenticated, (req,res) => {
        Review.find()
            .then(Reviews => {
                res.json(Reviews);
            })
            .catch(err => {
                console.error('Error fetching reviews:', err);
                res.status(500).json({ error: 'Internal server error' });
            });
    })
    .post(authJwtController.isAuthenticated, (req, res) => {
        const { movieId, username, review, rating } = req.body;
        Movie.findById(movieId)
        .then(movie => {
            if (!movie) {
                return res.status(404).json({ error: 'Movie not found' })
            }
            else{
                const newReview = new Review({
                    movieId,
                    username,
                    review,
                    rating
                });
        
                newReview.save()
                .then(() => {
                    res.json({ message: 'Review Created!' })
                })
                .catch(err => {
                    console.error('Error creating review:', err);
                    res.status(500).json({ error: 'Internal server error' });
                });
            }
        })
    })
    .all((req, res) => {
        // Any other HTTP Method
        // Returns a message stating that the HTTP method is unsupported.
        res.status(405).send({ message: 'HTTP method not supported.' });
    });


app.use('/', router);
app.listen(process.env.PORT || 8080);
module.exports = app; // for testing only


