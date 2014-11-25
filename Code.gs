/**
 * Compute the session file path
 * @param name - the session name
 * @returns {String}
 */
function sessionFilePath( name ) {
	return "vote_" + name ;
}

/**
 * remove all versions of the given file name
 * @param name - name of the file 
 * @returns
 */

function removeAllVersions(fileName){
	var docs=DocsList.find(fileName)
	
	for(n=0;n<docs.length;++n) {
		if(docs[n].getName() == fileName){
			Logger.log("file=" + docs[n].getName());
			var ID = docs[n].getId()
			DocsList.getFileById(ID).setTrashed(true)
	    }
	}
}

/***
 * Identify the current session
 */
function getCurrentSession() {
	Logger.log("getCurrentSession");
	
	var dir = DriveApp.getFilesByName( sessionFilePath("current"));
	if(!dir.hasNext())
		return "";
	var file = dir.next();
	
	Logger.log("Opening " + file.getName() );
	var ss = SpreadsheetApp.openByUrl(file.getUrl());
	var data = ss.getActiveSheet().getDataRange().getValues();	
	
	Logger.log("Data='" + data[0][0] + "'");
	
	if( ('' + data[0][0]).length == 0  ) {
		Logger.log("data is empty");
		return "";
	}
	else
		return data[0][0];
}


/**
 * Save the name of the current session to be voted
 * @param name
 */
function saveCurrentSession(name) {
	Logger.log("saveCurrentSession");
	var sessionFile = sessionFilePath( "current" );
	
	removeAllVersions( sessionFile );
	
	var ss = SpreadsheetApp.create(sessionFile);
	ss.appendRow([ name ]);
}


/**
 * Write some info to the status line
 * @param msg
 */
function statusMessage(msg) {
	var app = UiApp.getActiveApplication();
	var statusLine = app.getElementById("statusLine");

	Logger.log("status: " + msg);

	statusLine.setText(msg);
}


/**
 * Handle the situation where we would like to start a new session. If 
 * a session is already ongoing close this session. The button will be
 * changed accordingly.
 * 
 * @param e - EventInfo 
 * @returns
 */
function handleNewSession(e) {
	var app = UiApp.getActiveApplication();
	var currentSession = getCurrentSession();
	var mySession = e.parameter.SessionName;
	var sessionFile = sessionFilePath(mySession);
	var sessionId = app.getElementById("SessionName");	
	var button = app.getElementById("SessionStatus");

	Logger.log("handleNewSession: Session=" + mySession );

	if( currentSession != "" ) {
		statusMessage("Closing Session");
		
		sessionId.setText("");
		saveCurrentSession("");
		
		button.setText("Start");
	
		var dir = DriveApp.getFilesByName(sessionFile);
		if(!dir.hasNext()) 
			return app;
		var file = dir.next();
		
		Logger.log("Opening " + file.getName());
		var ss = SpreadsheetApp.openByUrl(file.getUrl());
		var data = ss.getActiveSheet().getDataRange();
		
		var chart = Charts.newBarChart()
			  .setTitle("Voting result for " + mySession )
			  .setRange(0,6)
		      .setDataTable(data)
		      .setXAxisTitle("Estimate")
		      .setYAxisTitle("Who")
		      .build();

		app.add(chart);
		  
		// show the voting result
		return app;
	}
		 
	// create a new session.
	if( mySession == "" ) {
		statusMessage("Session name missing")
		return app;
	}
	statusMessage("Creating Session " + mySession );

	
	var lck = LockService.getPublicLock();

	// ***** Begin critical section ******
	lck.waitLock(1000);
	if( !lck.hasLock() ) {
		statusMessage("Busy try again" );
		Logger.log("Could not aquire lock to create a new session");
		return;
	}
	
	saveCurrentSession(mySession);	
	
	removeAllVersions( sessionFile );	
	var ss = SpreadsheetApp.create( sessionFile, 50, 5);	
	Logger.log(ss.getUrl());	
	
	ss.appendRow([""]);

	lck.releaseLock();
	// ***** end critical section *****
	
	statusMessage("Session " + mySession + " created!");

	button.setText("Stop");
	 
	return app; 
}


/**
 * Setup the initial page
 * @returns
 */
function doGet() {
	var app = UiApp.createApplication().setTitle("Voting");
	var currentSession = getCurrentSession();

	var form = app.createFormPanel().setId('form').setEncoding('multipart/form-data');	
	// place the vote scale	
	var panel = app.createHorizontalPanel().setId("panel");	
	var sessionId = app.createTextBox().setName("SessionName").setId("SessionName");
	sessionId.setText(currentSession);	
	panel.add(sessionId);		
		
	var formContent = app.createGrid().resize(1,7);
	panel.add(formContent);
	
	for(var i=0; i< 5; ++i ) {
		var v = app.createRadioButton("vote", i+1 ).setFormValue(i+1);
	    formContent.setWidget(0, i, v);
	}	
	formContent.setWidget(0, 5, app.createTextBox().setName('voter'));	
	formContent.setWidget(0, 6, app.createSubmitButton('Vote'));
	
	// done with the panel
	form.add(panel);
	app.add(form);		
	

	// the voting control section
	var votingControl = app.createHorizontalPanel().setId("panel");
	var buttonText = currentSession == "" ? "Start" : "Stop";
	var handler = app.createServerHandler("handleNewSession").addCallbackElement(sessionId);	
	votingControl.add( app.createButton(buttonText, handler).setId("SessionStatus") );
	app.add(votingControl);

	// the status line
	app.add(app.createLabel("").setId("statusLine"));
		
	return app;
}

function doPost(e) {
	var app = UiApp.getActiveApplication(); 
	//use the group name to get the value of the selected radio
	var vote = e.parameter.vote;
	var voter = e.parameter.voter;
	var mySession = e.parameter.SessionName;
	
	Logger.log("source :" + e.parameter.source );
	
	Logger.log("Vote= " + vote + " for " + mySession + " by " + voter + ", ");
	  
	// check all parameters
	if( mySession == "" ) {
		statusMessage("No voting session active!")
		return app;
	}
	
	if( voter == "" ) {
		statusMessage("Voter Name is not given!");
		return app;
	}
	
	if( typeof(vote) === 'undefined' ) {
		statusMessage("No vote given!");
		return app;
	}
	
	statusMessage(voter + " voted with " + vote + " for " + mySession);
	
	// add the vote to the xls sheet 
	var lck = LockService.getPublicLock();

	// ***** Begin critical section ******
	lck.waitLock(5000);
	if( !lck.hasLock() ) {
		statusMessage("Busy try again" );
		Logger.log("Could not aquire lock to create a new session");
		return;
	}
	else {
		var dir = DriveApp.getFilesByName(sessionFilePath(mySession));
		if(!dir.hasNext())
			return "";
		var file = dir.next();
	
		Logger.log("Adding voter=" + voter + "vote=" + vote );
		
		var ss = SpreadsheetApp.openByUrl(file.getUrl());
		ss.getActiveSheet().appendRow([ voter, vote ]);	
	}
	lck.releaseLock();
	
	doGet(app);
	
	return app;
}


