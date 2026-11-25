CREATE TABLE `answers` (
	`reader` text NOT NULL,
	`question` text NOT NULL,
	`choice` text NOT NULL,
	`correct` integer NOT NULL,
	PRIMARY KEY(`reader`, `question`)
);
