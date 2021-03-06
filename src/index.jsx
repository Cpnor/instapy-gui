import 'styles/main.scss';

import 'jquery';
import 'popper.js';
import 'bootstrap';

import { h, render, Component } from 'preact';
import { BrowserRouter as Router, Route, Redirect } from 'react-router-dom';
import { Provider } from 'unistore/preact';

import store, { connect } from 'store';
import { NavBar, SideBar, Footer } from 'components';
import { Account, Configuration, Start, Dashboard } from 'sites';
import { setToken } from 'core';

import { PREMIUM } from 'config';

if (!PREMIUM) setToken();

@connect('showSidebar')
class App extends Component {
	render({ showSidebar }) {
		return (
			<Router>
				<div className='container-fluid'>
					<div className='row no-gutters'>

						{ showSidebar &&
							<div id='sidebar' className='col'>
								<Route
									path='/'
									component={ SideBar }
								/>
							</div>
						}

						<div className='col'>
							<NavBar />
							<div style={{ padding: '15px 15px 0 15px' }}>
								<Route exact path='/' render={ () => <Redirect to='/dashboard' /> } />
								<Route
									path='/account'
									component={ Account }
								/>
								<Route
									path='/configuration'
									component={ Configuration }
								/>
								<Route
									path='/start'
									component={ Start }
								/>
								<Route
									path='/dashboard'
									component={ Dashboard }
								/>
								<Footer />
							</div>
						</div>

					</div>
				</div>
			</Router>
		);
	}
}

render(
	<Provider store={ store }>
		<App />
	</Provider>, document.body);
