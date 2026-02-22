import React from 'react';
import styled from 'styled-components';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
    faFacebook,
    faTwitter,
    faInstagram,
    faLinkedin,
    faGithub,
} from '@fortawesome/free-brands-svg-icons';

const FooterContainer = styled.footer`
  background-color: #f8f9fa;
  padding: 20px 0;
  text-align: center;
  border-top: 1px solid #dee2e6;
  font-size: 0.9rem;
  color: #495057;
`;

const SocialLinks = styled.div`
  margin-bottom: 10px;

  a {
    color: #495057;
    margin: 0 10px;
    font-size: 1.2rem;
    transition: color 0.3s ease;

    &:hover {
      color: #007bff;
    }
  }
`;

const Copyright = styled.p`
  margin-bottom: 0;
`;

const Footer = () => {
  return (
    <FooterContainer>
      <SocialLinks>
        <a href="https://www.facebook.com/" target="_blank" rel="noopener noreferrer">
          <FontAwesomeIcon icon={faFacebook} />
        </a>
        <a href="https://www.twitter.com/" target="_blank" rel="noopener noreferrer">
          <FontAwesomeIcon icon={faTwitter} />
        </a>
        <a href="https://www.instagram.com/" target="_blank" rel="noopener noreferrer">
          <FontAwesomeIcon icon={faInstagram} />
        </a>
        <a href="https://www.linkedin.com/" target="_blank" rel="noopener noreferrer">
          <FontAwesomeIcon icon={faLinkedin} />
        </a>
        <a href="https://www.github.com/" target="_blank" rel="noopener noreferrer">
          <FontAwesomeIcon icon={faGithub} />
        </a>
      </SocialLinks>
      <Copyright>&copy; {new Date().getFullYear()} Your Company. All rights reserved.</Copyright>
    </FooterContainer>
  );
};

export default Footer;