import React from 'react';
import styled from 'styled-components';
import { Link } from 'react-router-dom';

const HeaderContainer = styled.header`
  background: rgba(255, 255, 255, 0.2);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  position: sticky;
  top: 0;
  left: 0;
  width: 100%;
  z-index: 100;
  padding: 1rem 2rem;
  display: flex;
  justify-content: space-between;
  align-items: center;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05);
`;

const Logo = styled.div`
  font-size: 1.5rem;
  font-weight: bold;
  color: #333;
  text-decoration: none;
  transition: color 0.3s ease;

  &:hover {
    color: #007bff;
  }
`;

const Nav = styled.nav`
  display: flex;
  align-items: center;
`;

const NavList = styled.ul`
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
`;

const NavItem = styled.li`
  margin-left: 2rem;

  &:first-child {
    margin-left: 0;
  }
`;

const NavLink = styled(Link)`
  text-decoration: none;
  color: #555;
  font-weight: 500;
  transition: color 0.3s ease;

  &:hover {
    color: #007bff;
  }

  &.active {
    color: #007bff;
    font-weight: bold;
  }
`;

const Header = () => {
  return (
    <HeaderContainer>
      <Logo>
        <Link to="/" style={{ textDecoration: 'none', color: 'inherit' }}>
          YourBrand
        </Link>
      </Logo>
      <Nav>
        <NavList>
          <NavItem>
            <NavLink to="/" activeclassname="active">
              Home
            </NavLink>
          </NavItem>
          <NavItem>
            <NavLink to="/about" activeclassname="active">
              About
            </NavLink>
          </NavItem>
          <NavItem>
            <NavLink to="/services" activeclassname="active">
              Services
            </NavLink>
          </NavItem>
          <NavItem>
            <NavLink to="/contact" activeclassname="active">
              Contact
            </NavLink>
          </NavItem>
        </NavList>
      </Nav>
    </HeaderContainer>
  );
};

export default Header;